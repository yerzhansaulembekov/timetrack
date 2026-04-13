const { getPool } = require('../_db');
const { getUser, requireAdmin } = require('../_auth');

function mapObj(r) {
  return { id: r.id, name: r.name, isActive: r.is_active, createdAt: r.created_at };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-User-Phone');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getUser(req, res);
  if (!user) return;
  if (!requireAdmin(user, res)) return;

  const { id } = req.query;
  const pool = getPool();

  try {
    if (req.method === 'PUT') {
      const { name, isActive } = req.body;
      const { rows } = await pool.query(
        'UPDATE work_objects SET name=COALESCE($1,name), is_active=COALESCE($2,is_active) WHERE id=$3 RETURNING *',
        [name ?? null, isActive ?? null, id]
      );
      if (!rows.length) return res.status(404).json({ message: 'Не найдено' });
      return res.json(mapObj(rows[0]));
    }

    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM work_objects WHERE id=$1', [id]);
      return res.status(204).end();
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
