const { getPool } = require('../_db');
const { getUser, requireAdmin } = require('../_auth');
const Decimal = require('decimal.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-User-Phone');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getUser(req, res);
  if (!user) return;
  if (!requireAdmin(user, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ message: 'Укажите год и месяц' });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert timesheet header
    let tsId;
    const { rows: existing } = await client.query(
      'SELECT id, status FROM timesheets WHERE year=$1 AND month=$2', [year, month]
    );
    if (existing.length) {
      if (existing[0].status === 'CLOSED') {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Табель закрыт и не может быть пересформирован' });
      }
      await client.query('DELETE FROM timesheet_rows WHERE timesheet_id=$1', [existing[0].id]);
      await client.query(
        'UPDATE timesheets SET status=$1, generated_at=NOW(), generated_by=$2 WHERE id=$3',
        ['GENERATED', user.id, existing[0].id]
      );
      tsId = existing[0].id;
    } else {
      const { rows } = await client.query(
        `INSERT INTO timesheets (year, month, status, generated_at, generated_by)
         VALUES ($1,$2,'GENERATED',NOW(),$3) RETURNING id`,
        [year, month, user.id]
      );
      tsId = rows[0].id;
    }

    // Build rows for every employee
    const { rows: employees } = await client.query('SELECT id, full_name FROM employees');

    const tsRows = [];
    for (const emp of employees) {
      const { rows: entrySums } = await client.query(
        `SELECT work_date, SUM(hours_worked) as total
         FROM time_entries
         WHERE employee_id=$1
           AND EXTRACT(YEAR  FROM work_date)=$2
           AND EXTRACT(MONTH FROM work_date)=$3
         GROUP BY work_date`,
        [emp.id, year, month]
      );

      let totalH = new Decimal(0);
      let totalD  = 0;
      const cells = [];

      for (const r of entrySums) {
        const h = new Decimal(r.total);
        const dateStr = r.work_date instanceof Date
          ? r.work_date.toISOString().split('T')[0]
          : String(r.work_date).split('T')[0];
        totalH = totalH.plus(h);
        totalD++;
        cells.push({ date: dateStr, h: h.toFixed(2) });
      }

      const { rows: rowRes } = await client.query(
        `INSERT INTO timesheet_rows (timesheet_id, employee_id, total_worked_hours, total_worked_days)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [tsId, emp.id, totalH.toFixed(2), totalD]
      );
      const rowId = rowRes[0].id;

      for (const cell of cells) {
        await client.query(
          'INSERT INTO timesheet_cells (timesheet_row_id, work_date, worked_hours) VALUES ($1,$2,$3)',
          [rowId, cell.date, cell.h]
        );
      }

      tsRows.push({
        id: rowId, employeeId: emp.id, employeeName: emp.full_name,
        totalWorkedHours: totalH.toFixed(2), totalWorkedDays: totalD,
        cells: cells.map(c => ({ workDate: c.date, workedHours: c.h }))
      });
    }

    await client.query('COMMIT');

    const { rows: ts } = await pool.query('SELECT * FROM timesheets WHERE id=$1', [tsId]);
    res.json({
      id: ts[0].id, year: ts[0].year, month: ts[0].month,
      status: ts[0].status, generatedAt: ts[0].generated_at,
      rows: tsRows,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};
