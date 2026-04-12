const { getPool } = require('./_db');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ message: 'Укажите номер телефона' });

    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, phone_number, full_name, position, role, is_active FROM employees WHERE phone_number = $1',
      [phoneNumber]
    );

    if (!rows.length) return res.status(404).json({ message: 'Пользователь не найден' });
    if (!rows[0].is_active) return res.status(403).json({ message: 'Аккаунт деактивирован' });

    const e = rows[0];
    res.json({
      id: e.id,
      phoneNumber: e.phone_number,
      fullName: e.full_name,
      position: e.position,
      role: e.role,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
