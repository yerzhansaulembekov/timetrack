const { getPool } = require('./_db');
const { getUser, requireAdmin } = require('./_auth');

function mapObj(r) {
  return { id: r.id, name: r.name, isActive: r.is_active, createdAt: r.created_at };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getUser(req, res);
  if (!user) return;

  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const q = user.role === 'ADMIN'
        ? 'SELECT * FROM work_objects ORDER BY created_at'
        : 'SELECT * FROM work_objects WHERE is_active = true ORDER BY created_at';
      const { rows } = await pool.query(q);
      return res.json(rows.map(mapObj));
    }

    if (!requireAdmin(user, res)) return;

    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: 'Введите название' });
      const { rows } = await pool.query(
        'INSERT INTO work_objects (name) VALUES ($1) RETURNING *', [name]
      );
      return res.status(201).json(mapObj(rows[0]));
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
