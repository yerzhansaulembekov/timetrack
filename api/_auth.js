const { getPool } = require('./_db');

// Returns { id, role } or sends 401/403 and returns null
async function getUser(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return null;
  }
  const phone = req.headers['x-user-phone'];
  if (!phone) {
    res.status(401).json({ message: 'Требуется заголовок X-User-Phone' });
    return null;
  }
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, role, is_active FROM employees WHERE phone_number = $1',
    [phone]
  );
  if (!rows.length) {
    res.status(401).json({ message: 'Пользователь не найден' });
    return null;
  }
  if (!rows[0].is_active) {
    res.status(403).json({ message: 'Аккаунт деактивирован' });
    return null;
  }
  return { id: rows[0].id, role: rows[0].role };
}

function requireAdmin(user, res) {
  if (user.role !== 'ADMIN') {
    res.status(403).json({ message: 'Только для администраторов' });
    return false;
  }
  return true;
}

module.exports = { getUser, requireAdmin };
