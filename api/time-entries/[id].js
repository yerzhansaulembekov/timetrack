const { getPool } = require('../_db');
const { getUser, requireAdmin } = require('../_auth');
const Decimal = require('decimal.js');

function mapEntry(r) {
  return {
    id: r.id, employeeId: r.employee_id, workDate: r.work_date,
    objectId: r.object_id, hoursWorked: r.hours_worked,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await getUser(req, res);
  if (!user) return;
  if (!requireAdmin(user, res)) return;

  const { id } = req.query;
  const pool = getPool();

  try {
    // PUT /api/time-entries/:id
    if (req.method === 'PUT') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: existing } = await client.query(
          'SELECT * FROM time_entries WHERE id=$1', [id]
        );
        if (!existing.length) return res.status(404).json({ message: 'Не найдено' });
        const entry = existing[0];

        const targetDate = req.body.workDate || entry.work_date;
        const targetH    = new Decimal(req.body.hoursWorked ?? entry.hours_worked);

        const { rows: sums } = await client.query(
          `SELECT COALESCE(SUM(hours_worked),0) as total
           FROM time_entries WHERE employee_id=$1 AND work_date=$2 AND id!=$3 FOR UPDATE`,
          [entry.employee_id, targetDate, id]
        );
        const others = new Decimal(sums[0].total);
        if (others.plus(targetH).gt(12)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message: `Превышен дневной лимит (12 ч). Остальные записи: ${others.toFixed(2)}ч`
          });
        }

        const { rows } = await client.query(
          `UPDATE time_entries
           SET work_date=$1, object_id=COALESCE($2,object_id), hours_worked=$3,
               updated_by=$4, updated_at=NOW()
           WHERE id=$5 RETURNING *`,
          [targetDate, req.body.objectId || null, targetH.toFixed(2), user.id, id]
        );
        await client.query('COMMIT');
        return res.json(mapEntry(rows[0]));
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    // DELETE /api/time-entries/:id
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM time_entries WHERE id=$1', [id]);
      return res.status(204).end();
    }

    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
};
