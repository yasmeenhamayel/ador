// =============================================================================
// AODORA PERFUME STORE — Full-Stack Backend
// Node.js + Express + better-sqlite3 + JWT + Multer + Gemini Vision
// =============================================================================
'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const Database  = require('better-sqlite3');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Constants ─────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT         || 3000;
const JWT_SECRET  = process.env.JWT_SECRET   || 'aodora-dev-secret-please-change';
const DB_PATH     = process.env.DB_PATH      || './aodora.db';
const GEMINI_KEY  = process.env.GEMINI_API_KEY || '';
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ── Ensure uploads directory exists ──────────────────────────────────────────
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve the frontend
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
// Serve uploaded files for product images added via admin
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Multer — disk storage for outfit images ───────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `outfit_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// ── SQLite Database ───────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema & Seed ─────────────────────────────────────────────────────────────
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      phone      TEXT,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'user',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS perfumes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      brand         TEXT    NOT NULL DEFAULT 'AODORA',
      category      TEXT    NOT NULL,
      price         REAL    NOT NULL,
      old_price     REAL,
      description   TEXT,
      notes_top     TEXT,
      notes_mid     TEXT,
      notes_base    TEXT,
      size          TEXT    DEFAULT '120ml',
      concentration TEXT    DEFAULT 'Eau de Parfum',
      rating        REAL    DEFAULT 4.5,
      reviews       INTEGER DEFAULT 0,
      stock         INTEGER DEFAULT 20,
      badge         TEXT,
      image_path    TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      items_json TEXT    NOT NULL,
      total      REAL    NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'pending',
      address    TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Seed default admin ────────────────────────────────────────────────────
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@perfume.com');
  if (!adminExists) {
    db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`)
      .run('مدير النظام', 'admin@perfume.com', bcrypt.hashSync('admin123', 10), 'admin');
    console.log('✅  Created default admin: admin@perfume.com / admin123');
  }

  // ── Seed a regular test user ──────────────────────────────────────────────
  const userExists = db.prepare('SELECT id FROM users WHERE email = ?').get('user@perfume.com');
  if (!userExists) {
    db.prepare(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`)
      .run('سارة أحمد', 'user@perfume.com', bcrypt.hashSync('user123', 10), 'user');
    console.log('✅  Created test user: user@perfume.com / user123');
  }

  // ── Seed sample perfumes ──────────────────────────────────────────────────
  const perfumeCount = db.prepare('SELECT COUNT(*) as n FROM perfumes').get().n;
  if (perfumeCount === 0) {
    const ins = db.prepare(`
      INSERT INTO perfumes (name, brand, category, price, old_price, description,
        notes_top, notes_mid, notes_base, size, concentration, rating, reviews, stock, badge, image_path)
      VALUES (@name, @brand, @category, @price, @old_price, @description,
        @notes_top, @notes_mid, @notes_base, @size, @concentration, @rating, @reviews, @stock, @badge, @image_path)
    `);

    const seedAll = db.transaction((rows) => { for (const r of rows) ins.run(r); });

    seedAll([
      {
        name: 'عود ملكي', brand: 'AODORA', category: 'رجالي',
        price: 150, old_price: 250,
        description: 'عطر عود ملكي فاخر بمزيج من العود الكمبودي والعنبر الدافئ مع لمسات من الورد الطائفي. رائحة ثابتة وجذابة تدوم طويلاً.',
        notes_top: 'الزعفران، الهيل',
        notes_mid: 'العود الكمبودي، الورد الطائفي',
        notes_base: 'العنبر، المسك الأبيض',
        size: '120ml', concentration: 'Eau de Parfum',
        rating: 4.8, reviews: 124, stock: 15, badge: 'الأكثر مبيعاً',
        image_path: 'images/royal.jpeg'
      },
      {
        name: "Lueur d'Or", brand: 'AODORA', category: 'نسائي',
        price: 150, old_price: null,
        description: 'عطر يجسد التوازن المثالي بين الأناقة الباريسية وسحر الشرق الغامض. يبدأ بنسمات الياسمين النقي وينتهي بقاعدة دافئة لا تُنسى.',
        notes_top: 'البرغموت، الكمثرى، الزعفران',
        notes_mid: 'الياسمين الغني، مسك الروم، زهر البرتقال',
        notes_base: 'العنبر، الياسمين، المسك الأبيض',
        size: '120ml', concentration: 'Eau de Parfum',
        rating: 4.6, reviews: 89, stock: 22, badge: 'جديد',
        image_path: 'images/lueur.jpeg'
      },
      {
        name: 'Noir Impact (الأثر الأسود)', brand: 'AODORA', category: 'رجالي',
        price: 150, old_price: 200,
        description: 'عطر مصمم ليترك أثراً قوياً. يوازن بين حلاوة الفاكهة وعمق الأخشاب بتركيبة تجعلك مميزاً في كل مكان.',
        notes_top: 'التفاح الحلو المنعش، أوراق Davana',
        notes_mid: 'وردة الداماسك، الأوسمانثوس، الألبانوم',
        notes_base: 'الفانيليا السوداء، حبوب التونكا، خشب الأرز',
        size: '120ml', concentration: 'Parfum',
        rating: 4.9, reviews: 156, stock: 8, badge: 'حصري',
        image_path: 'images/noir.jpeg'
      },
      {
        name: 'Velvet Aura', brand: 'AODORA', category: 'نسائي',
        price: 170, old_price: null,
        description: 'عطر نسائي فاخر يجسد الأنوثة الساحرة. مزيج فريد من الورد الدمشقي والفاوانيا والمسك الأبيض يخلق هالة مخملية تأسر الحواس.',
        notes_top: 'انتعاش عشبي فوار',
        notes_mid: 'اللافندر الصافي',
        notes_base: 'مسك خشبي ناعم',
        size: '120ml', concentration: 'Eau de Parfum',
        rating: 4.7, reviews: 67, stock: 30, badge: null,
        image_path: 'images/velvet.jpeg'
      },
      {
        name: "L'Horizon (الأفق)", brand: 'AODORA', category: 'للجنسين',
        price: 130, old_price: 200,
        description: 'طاقة الحمضيات ونعومة المسك. يمنح شعوراً فورياً بالنظافة والراحة ويناسب الجنسين في كل الأوقات.',
        notes_top: 'الليمون الصقلي، الشاي الأخضر',
        notes_mid: 'الياسمين، المتّي (Mate)',
        notes_base: 'طحلب البلوط، المسك',
        size: '120ml', concentration: 'Parfum',
        rating: 4.9, reviews: 201, stock: 5, badge: 'نادر',
        image_path: 'images/lihorizon.jpeg'
      },
      {
        name: 'Rose Amber Oud', brand: 'AODORA', category: 'نسائي',
        price: 185, old_price: 220,
        description: 'مزيج رومانسي ساحر يجمع بين الورد البلغاري والعنبر الكريمي وعمق العود. عطر للسهرات والمناسبات الخاصة.',
        notes_top: 'الورد البلغاري، الفراولة',
        notes_mid: 'العنبر الكريمي، العود الهندي',
        notes_base: 'خشب الصندل، الفانيليا، المسك الأبيض',
        size: '100ml', concentration: 'Eau de Parfum',
        rating: 4.7, reviews: 88, stock: 18, badge: null,
        image_path: 'images/velvet.jpeg'
      },
      {
        name: 'Cedar Sport', brand: 'AODORA', category: 'رجالي',
        price: 120, old_price: 150,
        description: 'عطر رياضي منعش يجمع بين نضارة الحمضيات وقوة خشب الأرز. مثالي للاستخدام اليومي والرياضة.',
        notes_top: 'الليمون، البرغموت، الجريب فروت',
        notes_mid: 'اللافندر، خشب الأرز',
        notes_base: 'المسك الأبيض، الأمبركريس',
        size: '120ml', concentration: 'Eau de Toilette',
        rating: 4.5, reviews: 45, stock: 35, badge: null,
        image_path: 'images/noir.jpeg'
      }
    ]);

    console.log('✅  Seeded 7 sample perfumes.');
  }
}

initDB();

// ── Gemini AI client ──────────────────────────────────────────────────────────
const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null;

// ── JWT middleware ────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'غير مصرح — يرجى تسجيل الدخول أولاً' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin')
      return res.status(403).json({ error: 'هذه العملية تتطلب صلاحيات المدير' });
    next();
  });
}

// =============================================================================
// AUTH ROUTES  /api/auth/*
// =============================================================================

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name?.trim() || !email?.trim() || !password)
    return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة' });

  if (password.length < 6)
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });

  const hash   = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), email.trim().toLowerCase(), phone || null, hash, 'user');

  const user  = { id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), role: 'user' };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ token, user });
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password))
    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });

  const user  = { id: row.id, name: row.name, email: row.email, role: row.role };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

  res.json({ token, user });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(row);
});

// PUT /api/auth/me  (update profile)
app.put('/api/auth/me', requireAuth, (req, res) => {
  const { name, phone, password } = req.body;
  const updates = [];
  const params  = [];

  if (name?.trim())  { updates.push('name = ?');  params.push(name.trim()); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
  if (password) {
    if (password.length < 6)
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    updates.push('password = ?');
    params.push(bcrypt.hashSync(password, 10));
  }

  if (!updates.length) return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

// =============================================================================
// PERFUMES ROUTES  /api/perfumes/*
// =============================================================================

app.get('/api/perfumes', (req, res) => {
  const { category, q } = req.query;
  let sql = 'SELECT * FROM perfumes WHERE 1=1';
  const params = [];

  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (q) {
    sql += ' AND (name LIKE ? OR description LIKE ? OR notes_top LIKE ? OR notes_mid LIKE ? OR notes_base LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY rating DESC';

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/perfumes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM perfumes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'العطر غير موجود' });
  res.json(row);
});

// Admin: add perfume
app.post('/api/perfumes', requireAdmin, (req, res) => {
  const { name, brand, category, price, old_price, description, notes_top, notes_mid, notes_base,
          size, concentration, rating, reviews, stock, badge, image_path } = req.body;

  if (!name || !category || !price)
    return res.status(400).json({ error: 'الاسم والتصنيف والسعر مطلوبة' });

  const result = db.prepare(`
    INSERT INTO perfumes (name, brand, category, price, old_price, description, notes_top, notes_mid,
      notes_base, size, concentration, rating, reviews, stock, badge, image_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, brand || 'AODORA', category, price, old_price || null, description || '',
         notes_top || '', notes_mid || '', notes_base || '',
         size || '120ml', concentration || 'Eau de Parfum',
         rating || 4.5, reviews || 0, stock || 20, badge || null, image_path || '');

  res.status(201).json({ id: result.lastInsertRowid, message: 'تم إضافة العطر بنجاح' });
});

// Admin: update perfume
app.put('/api/perfumes/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM perfumes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'العطر غير موجود' });

  const fields = ['name','brand','category','price','old_price','description','notes_top','notes_mid',
                  'notes_base','size','concentration','rating','reviews','stock','badge','image_path'];
  const updates = [];
  const params  = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
  params.push(req.params.id);
  db.prepare(`UPDATE perfumes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: 'تم تحديث العطر بنجاح' });
});

// Admin: delete perfume
app.delete('/api/perfumes/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT id FROM perfumes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'العطر غير موجود' });
  db.prepare('DELETE FROM perfumes WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف العطر بنجاح' });
});

// =============================================================================
// AI OUTFIT RECOMMENDATION  /api/recommend
// =============================================================================

app.post('/api/recommend', requireAuth, upload.single('outfit'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'يرجى رفع صورة الزي أولاً' });

  const filePath = req.file.path;

  try {
    const perfumes    = db.prepare('SELECT * FROM perfumes ORDER BY rating DESC').all();
    const perfumeList = perfumes.map(p =>
      `[ID:${p.id}] ${p.name} | الفئة: ${p.category} | السعر: ${p.price} ش.ج | ` +
      `النوتات: ${[p.notes_top, p.notes_mid, p.notes_base].filter(Boolean).join(' / ')} | ` +
      `الوصف: ${(p.description || '').slice(0, 80)}`
    ).join('\n');

    const prompt = `
أنت خبير عطور محترف ومتخصص في تنسيق العطور مع الأزياء.

**مهمتك:** حلّل صورة الزي المرفقة بدقة، ثم أوصِ بأنسب العطور من قائمتنا.

**خطوات التحليل:**
1. لاحظ ألوان الزي (داكنة/فاتحة/متوسطة)
2. حدّد أسلوبه (رسمي / كاجوال / رومانسي / رياضي / كلاسيكي شرقي / عصري أنيق)
3. تخيّل المناسبة المناسبة له (عمل / سهرة / يومي / رياضة / حفلة)
4. حدّد الموسم الأنسب (صيف / شتاء / خريف / ربيع / كل الأوقات)
5. خمّن جنس مرتدي الزي أو ما إذا كان يناسب الجنسين

**عطورنا المتاحة:**
${perfumeList}

**مطلوب:** أوصِ بـ 3 عطور مناسبة تماماً لهذا الزي.

**أجب بـ JSON فقط** — لا نص قبله ولا بعده — بهذا الشكل الدقيق:
{
  "style_detected": "وصف أسلوب الزي في جملة",
  "mood": "الكلمة الوصفية للمزاج (مثال: رومانسي، قوي، منعش)",
  "occasion": "المناسبة المقترحة",
  "season": "الموسم المناسب",
  "analysis": "فقرة قصيرة 2-3 جمل تحلل الزي وتشرح منطق الاختيار",
  "recommended_ids": [id1, id2, id3],
  "reasons": {
    "id1": "سبب التوافق مع هذا العطر تحديداً",
    "id2": "سبب التوافق مع هذا العطر تحديداً",
    "id3": "سبب التوافق مع هذا العطر تحديداً"
  }
}
`.trim();

    if (!genAI) {
      return res.status(503).json({
        error: 'مفتاح Gemini API غير مضاف. أضف GEMINI_API_KEY في ملف .env'
      });
    }

    const imageBytes = fs.readFileSync(filePath);
    const imageB64   = imageBytes.toString('base64');
    const mimeType   = req.file.mimetype;

const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent([
      { inlineData: { data: imageB64, mimeType } },
      prompt
    ]);

    const rawText  = result.response.text().trim();
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let aiData;
    try {
      aiData = JSON.parse(jsonText);
    } catch {
      console.error('Gemini raw response:', rawText);
      return res.status(500).json({ error: 'تعذّر تحليل رد الذكاء الاصطناعي. حاول مجدداً.' });
    }

    const recommendedIds = (aiData.recommended_ids || []).map(Number);
    const recommended    = recommendedIds
      .map(id => {
        const p = perfumes.find(p => p.id === id);
        if (!p) return null;
        return { ...p, ai_reason: aiData.reasons?.[String(id)] || '' };
      })
      .filter(Boolean);

    const finalPerfumes = recommended.length > 0
      ? recommended
      : perfumes.slice(0, 3).map(p => ({ ...p, ai_reason: 'مقترح بناءً على التقييم' }));

    res.json({
      style_detected: aiData.style_detected || '',
      mood:           aiData.mood           || '',
      occasion:       aiData.occasion       || '',
      season:         aiData.season         || '',
      analysis:       aiData.analysis       || '',
      perfumes:       finalPerfumes
    });

  } catch (err) {
    console.error('Recommend error:', err.message);
    res.status(500).json({ error: `خطأ في التحليل: ${err.message}` });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

// =============================================================================
// ORDERS ROUTES  /api/orders/*
// =============================================================================

// Get current user's orders
app.get('/api/orders', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items_json) })));
});

// Create order
app.post('/api/orders', requireAuth, (req, res) => {
  const { items, total, address } = req.body;
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'السلة فارغة' });

  const result = db.prepare(
    'INSERT INTO orders (user_id, items_json, total, address) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, JSON.stringify(items), total || 0, address || '');

  res.status(201).json({ id: result.lastInsertRowid, message: 'تم إنشاء الطلب بنجاح' });
});

// Admin: get all orders
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, u.name as user_name, u.email as user_email
    FROM orders o JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `).all();
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items_json) })));
});

// Admin: update order status
app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!allowed.includes(status))
    return res.status(400).json({ error: 'حالة غير صالحة' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'تم تحديث الحالة' });
});

// Admin: get all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(rows);
});

// Admin: dashboard stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalUsers    = db.prepare("SELECT COUNT(*) as n FROM users WHERE role='user'").get().n;
  const totalOrders   = db.prepare('SELECT COUNT(*) as n FROM orders').get().n;
  const totalRevenue  = db.prepare("SELECT COALESCE(SUM(total),0) as n FROM orders WHERE status != 'cancelled'").get().n;
  const totalProducts = db.prepare('SELECT COUNT(*) as n FROM perfumes').get().n;
  const pendingOrders = db.prepare("SELECT COUNT(*) as n FROM orders WHERE status='pending'").get().n;
  res.json({ totalUsers, totalOrders, totalRevenue, totalProducts, pendingOrders });
});

// =============================================================================
// FALLBACK — serve index.html for all non-API routes
// =============================================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌸  AODORA server running → http://localhost:${PORT}`);
  console.log(`📁  Serving frontend from: ${FRONTEND_DIR}`);
  console.log(`🗄️   Database: ${path.resolve(DB_PATH)}`);
  console.log(GEMINI_KEY
    ? '🤖  Gemini AI: ✅  connected'
    : '⚠️   Gemini AI: key missing — add GEMINI_API_KEY to .env\n');
});
