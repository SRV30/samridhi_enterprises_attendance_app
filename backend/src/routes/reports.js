const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Visit = require('../models/Visit');
const { authenticate, allowRoles } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, allowRoles('admin'));

function isValidDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function getDateRange(query) {
  const { from, to, employeeId } = query;
  if (!isValidDay(from) || !isValidDay(to)) {
    const error = new Error('Provide valid from and to dates in YYYY-MM-DD format');
    error.status = 400;
    throw error;
  }
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date(to + 'T00:00:00.000Z');
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days < 1) {
    const error = new Error('The end date must be on or after the start date');
    error.status = 400;
    throw error;
  }
  if (days > 92) {
    const error = new Error('Choose a date range of 92 days or less');
    error.status = 400;
    throw error;
  }
  if (employeeId && !mongoose.isValidObjectId(employeeId)) {
    const error = new Error('Invalid employee filter');
    error.status = 400;
    throw error;
  }
  return { from, to, employeeId };
}

async function buildReport(query) {
  const range = getDateRange(query);
  const employeeFilter = { role: 'employee' };
  if (range.employeeId) employeeFilter._id = range.employeeId;

  const employees = await User.find(employeeFilter)
    .select('name employeeId active')
    .sort({ name: 1 })
    .lean();
  const employeeIds = employees.map(employee => employee._id);
  const visits = employeeIds.length
    ? await Visit.find({
        employee: { $in: employeeIds },
        attendanceDay: { $gte: range.from, $lte: range.to }
      })
        .populate('shop', 'name shopCode area')
        .sort({ attendanceDay: 1, checkedInAt: 1 })
        .lean()
    : [];

  const grouped = new Map();
  for (const visit of visits) {
    const employeeKey = String(visit.employee);
    if (!grouped.has(employeeKey)) grouped.set(employeeKey, new Map());
    const days = grouped.get(employeeKey);
    if (!days.has(visit.attendanceDay)) days.set(visit.attendanceDay, []);
    days.get(visit.attendanceDay).push({
      id: String(visit._id),
      shopName: visit.shop?.name || 'Shop',
      shopCode: visit.shop?.shopCode || '',
      checkedInAt: visit.checkedInAt,
      distanceMeters: visit.distanceMeters
    });
  }

  const reportEmployees = employees.map(employee => {
    const dayMap = grouped.get(String(employee._id)) || new Map();
    const attendance = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayVisits]) => ({
      date,
      visitCount: dayVisits.length,
      visits: dayVisits
    }));
    return {
      id: String(employee._id),
      name: employee.name,
      employeeId: employee.employeeId,
      active: employee.active,
      presentDays: attendance.length,
      visitCount: attendance.reduce((total, day) => total + day.visitCount, 0),
      attendance
    };
  });

  return {
    from: range.from,
    to: range.to,
    timeZone: 'Asia/Kolkata',
    generatedAt: new Date().toISOString(),
    totals: {
      employeeCount: reportEmployees.length,
      employeesWithAttendance: reportEmployees.filter(employee => employee.presentDays > 0).length,
      presentDays: reportEmployees.reduce((total, employee) => total + employee.presentDays, 0),
      visitCount: visits.length
    },
    employees: reportEmployees
  };
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function toCsv(report) {
  const columns = [
    'Row Type', 'Employee Name', 'Employee ID', 'Account Status',
    'Present Days', 'Total Verified Visits', 'Attendance Date',
    'Visits That Day', 'Shop Name', 'Shop Code', 'Check-in Time (Asia/Kolkata)',
    'Distance (metres)'
  ];
  const rows = [columns];
  const formatTime = value => value ? new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium'
  }).format(new Date(value)) : '';

  for (const employee of report.employees) {
    rows.push([
      'Employee summary', employee.name, employee.employeeId,
      employee.active ? 'Active' : 'Inactive', employee.presentDays,
      employee.visitCount, '', '', '', '', '', ''
    ]);
    for (const day of employee.attendance) {
      for (const visit of day.visits) {
        rows.push([
          'Verified shop visit', employee.name, employee.employeeId,
          employee.active ? 'Active' : 'Inactive', employee.presentDays,
          employee.visitCount, day.date, day.visitCount, visit.shopName,
          visit.shopCode, formatTime(visit.checkedInAt), visit.distanceMeters
        ]);
      }
    }
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

router.get('/attendance', async (req, res, next) => {
  try {
    const report = await buildReport(req.query);
    res.setHeader('Cache-Control', 'no-store');
    res.json(report);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});

router.get('/attendance.csv', async (req, res, next) => {
  try {
    const report = await buildReport(req.query);
    const filename = 'samridhi-attendance-' + report.from + '-to-' + report.to + '.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(toCsv(report));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});

module.exports = router;
