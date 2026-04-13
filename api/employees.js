const { getPool } = require('./_db');
const { getUser, requireAdmin } = require('./_auth');

function mapEmp(r) {
  return { id: r.id, phoneNumber: r.phone_number, fullName: r.full_name, position: r.position, role: r.role, isActive: r.is_active, createdAt: r.created_at };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-User-Phone');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getUser(req, res);
  if (!user) return;
  if (!requireAdmin(user, res)) return;

  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM employees ORDER BY created_at');
      return res.json(rows.map(mapEmp));
    }

    if (req.method === 'POST') {
      const { phoneNumber, fullName, position, role } = req.body;
      if (!phoneNumber || !fullName || !position || !role)
        return res.status(400).json({ message: 'Заполните все поля' });
      const { rows } = await pool.query(
        'INSERT INTO employees (phone_number, full_name, position, role) VALUES ($1,$2,$3,$4) RETURNING *',
        [phoneNumber, fullName, position, role]
      );
      return res.status(201).json(mapEmp(rows[0]));
    }

    res.status(405).end();
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'Телефонный номер уже зарегистрирован' });
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
