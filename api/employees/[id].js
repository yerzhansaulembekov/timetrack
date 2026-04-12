const { getPool } = require('../_db');
const { getUser, requireAdmin } = require('../_auth');

function mapEmp(r) {
  return { id: r.id, phoneNumber: r.phone_number, fullName: r.full_name, position: r.position, role: r.role, isActive: r.is_active, createdAt: r.created_at };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getUser(req, res);
  if (!user) return;
  if (!requireAdmin(user, res)) return;

  const { id } = req.query;
  const pool = getPool();

  try {
    // PUT /api/employees/:id — update employee data
    if (req.method === 'PUT') {
      const { phoneNumber, fullName, position, role } = req.body;
      const { rows } = await pool.query(
        'UPDATE employees SET phone_number=$1, full_name=$2, position=$3, role=$4 WHERE id=$5 RETURNING *',
        [phoneNumber, fullName, position, role, id]
      );
      if (!rows.length) return res.status(404).json({ message: 'Не найдено' });
      return res.json(mapEmp(rows[0]));
    }

    // PATCH /api/employees/:id — toggle isActive
    if (req.method === 'PATCH') {
      const { isActive } = req.body;
      const { rows } = await pool.query(
        'UPDATE employees SET is_active=$1 WHERE id=$2 RETURNING *',
        [isActive, id]
      );
      if (!rows.length) return res.status(404).json({ message: 'Не найдено' });
      return res.json(mapEmp(rows[0]));
    }

    // DELETE /api/employees/:id
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM employees WHERE id=$1', [id]);
      return res.status(204).end();
    }

    res.status(405).end();
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ message: 'Телефонный номер уже зарегистрирован' });
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
