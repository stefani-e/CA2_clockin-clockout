const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');

const session = require('express-session');

const flash = require('connect-flash');

const path = require('path');
const app = express();


const db = mysql.createConnection({
    host: 'jt25h7.h.filess.io',
    user: 'CA2_animaloff',
    password: '179a48eeb474b383fe35657929e2dc3a8cbc3b4f',
    database: 'CA2_animaloff',
    port: 61002,
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'Public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('Public'));
;


app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,

}));

app.use(flash());


app.set('view engine', 'ejs');
const checkAuthenticated = (req, res, next) => {
    if (req.session.staff) { 
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};
const checkAdmin = (req, res, next) => {
    if (!req.session.staff) { 
        req.flash('error', 'Please log in first');
        return res.redirect('/login');
    }

    if (req.session.staff.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        return res.redirect('/Staff');
    }
};
app.get('/', (req, res) => {
    res.render('index', { user: req.session.staff, messages: req.flash('success') });
});
app.get('/Admin', checkAdmin, (req, res) => {
    const sql = 'SELECT * FROM staff';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('DB Error:', err);
            return res.status(500).send('Database Error');
        }
        res.render('Admin', {
            user: req.session.staff,
            staff: results,
            messages: req.flash('success')
        });
    });
});
app.get('/Staff', checkAuthenticated, (req, res) => {
    if (req.session.staff.role === 'admin') {
        return res.redirect('/Admin');
    }

    const staff_id = req.session.staff.staff_id;
    const sqlStaff = 'SELECT * FROM staff WHERE staff_id = ?';
    const sqlTimesheet = 'SELECT * FROM timesheet WHERE staff_id = ?';

    db.query(sqlStaff, [staff_id], (err, staffResults) => {
        if (err) {
            console.error('Error retrieving staff:', err);
            return res.status(500).send('Database error');
        }

        db.query(sqlTimesheet, [staff_id], (err, timesheetResults) => {
            if (err) {
                console.error('Error retrieving timesheet:', err);
                return res.status(500).send('Database error');
            }

            res.render('Staff', {
                user: req.session.staff,
                staff: staffResults[0], 
                timesheet: timesheetResults,
                messages: req.flash('success'),
                user: req.session.staff
            });
        });
    });
});


app.get('/search', checkAdmin, (req, res) => {
    const searchTerm = req.query.search;
    if (!searchTerm) {
        return res.redirect('/Admin');
    }
    
    const query = `
        SELECT * FROM staff 
        WHERE LOWER(staff_name) LIKE ?
    `;
    db.query(query, [`%${searchTerm.toLowerCase()}%`], (err, results) => {
        if (err) {
            console.error('Error finding', err);
            return res.status(500).json({ error: 'Staff Not Found' });
        }
        if (results.length > 0) {
            
            res.render('Admin', { staff: results, user: req.session.staff, messages: req.flash('success') });
        } else {
            
            req.flash('success', 'No results found');
            res.render('Admin', { staff: [], user: req.session.staff, messages: req.flash('success') });
        }
    });
});

app.get('/filter', checkAuthenticated, (req, res) => {
    const date = req.query.date;
    let staff_id;

    if (req.session.staff.role === 'admin' && req.query.staff_id) {
        staff_id = req.query.staff_id;
    } else {
        staff_id = req.session.staff.staff_id;
    }

    if (!date) {
        
        if (req.session.staff.role === 'admin') {
            return res.redirect(`/Staff/${staff_id}`);
        } else {
            return res.redirect('/Staff');
        }
    }

 
    db.query('SELECT * FROM staff WHERE staff_id = ?', [staff_id], (err, staffResults) => {
        if (err || !staffResults.length) {
            return res.status(500).send('Staff not found');
        }
        db.query('SELECT * FROM timesheet WHERE date LIKE ? AND staff_id = ?', [`%${date}%`, staff_id], (err, results) => {
            if (err) {
                console.error('DB Error:', err);
                return res.status(500).send('Not Found');
            }
            res.render('Staff', {
                user: req.session.staff,
                staff: staffResults[0],
                timesheet: results,
                messages: req.flash('success')
            });
        });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

const validateRegistration = (req, res, next) => {
    const { staff_name, password, role } = req.body;

    if (!staff_name || !password || !role) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (role !== 'admin' && role !== 'staff') {
        req.flash('error', 'Invalid role selected.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    next();
};


app.post('/register', upload.single('image'), validateRegistration, (req, res) => {
    const { staff_name, password, role } = req.body;
    const image = req.file ? req.file.filename : null;

    const sql = 'INSERT INTO staff (staff_name, password, role, image) VALUES (?, SHA1(?), ?, ?)';
    db.query(sql, [staff_name, password, role, image], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'staff_name already exists.');
                req.flash('formData', req.body);
                return res.redirect('/register');
            }
            throw err;
        }
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});


app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { staff_name, password } = req.body;

    if (!staff_name || !password) {
        req.flash('error', 'staff_name and password are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM staff WHERE staff_name = ? AND password = SHA1(?)';
    db.query(sql, [staff_name, password], (err, results) => {
        if (err) {
            throw err;
        }
        if (results.length > 0) {
            req.session.staff = results[0];
            req.flash('success', 'Login successful!');
            res.redirect('/');
        } else {
            req.flash('error', 'Invalid staff_name or password.');
            res.redirect('/login');
        }
    });
});


app.get('/add/:staff_id', (req, res) => {
  if (!req.session.staff) return res.redirect('/login');

  const staff_id   = req.params.staff_id;
  const staff_name = req.session.staff.staff_name;

  res.render('add', {
    messages:   [],
    formData:   {},
    staff_id,
    staff_name
  });
});


app.post('/add/:staff_id', (req, res) => {
  if (!req.session.staff) return res.redirect('/login');

  const staff_id   = req.params.staff_id;
  const staff_name = req.body.staff_name; 
  const { clock_in, break_start, break_end, clock_out, total_hour, date } = req.body;

  const sql = `
    INSERT INTO timesheet 
      (staff_id, clock_in, break_start, break_end, clock_out, total_hour, date)
    VALUES (?,?,?,?,?,?,?)
  `;
  db.query(
    sql,
    [staff_id, clock_in, break_start, break_end, clock_out, total_hour, date],
    err => {
      if (err) throw err;
      req.flash('success','Timesheet added!');
      res.redirect(`/staff/${staff_id}`);
    }
  );
});

app.get('/update', (req, res) => {
    res.status(400).send('Timesheet ID is required');
});

app.get('/update/:timesheet_id', (req, res) => {
    const timesheet_id = req.params.timesheet_id;

    const sql = `
        SELECT t.*, s.staff_name, s.image 
        FROM timesheet t
        JOIN staff s ON t.staff_id = s.staff_id
        WHERE t.timesheet_id = ?
    `;

    db.query(sql, [timesheet_id], (error, results) => {
        if (error) {
            console.error('Error retrieving timesheet:', error.message);
            return res.status(500).send('Error retrieving timesheet');
        }

        if (results.length > 0) {
            res.render('update', { timesheet: results[0] });
        } else {
            res.status(404).send('Timesheet not found');
        }
    });
});


app.post('/update/:timesheet_id', (req, res) => {
    const timesheet_id = req.params.timesheet_id;
    const { clock_out, clock_in, break_start, break_end, total_hour, date } = req.body;

    const sql = `
        UPDATE timesheet
        SET clock_out = ?, clock_in = ?, break_start = ?, break_end = ?, total_hour = ?, date = ?
        WHERE timesheet_id = ?
    `;

    db.query(sql, [clock_out, clock_in, break_start, break_end, total_hour, date, timesheet_id], (error) => {
        if (error) {
            console.error("Error updating timesheet:", error);
            return res.status(500).send('Error updating timesheet');
        }

        res.redirect('/Staff');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');
    });
});

app.get('/delete/:staff_id', (req, res) => {
    const staff_id = req.params.staff_id;
    db.query('DELETE FROM staff WHERE staff_id = ?', [staff_id], (error, results) => {
        if (error) {
            
            console.error("Error deleting.", error);
            res.status(500).send('Error deleting.');
        } else {
           
            res.redirect('/Admin');
        }
    });
});

app.get('/delete-timesheet/:timesheet_id', (req, res) => {
  const timesheet_id = req.params.timesheet_id;
  db.query('DELETE FROM timesheet WHERE timesheet_id = ?', [timesheet_id], (error, results) => {
    if (error) {
      console.error("Error deleting timesheet.", error);
      return res.status(500).send('Error deleting timesheet.');
    }
    req.flash('success', 'Timesheet deleted!');
    res.redirect('/Staff');
  });
});

app.get('/staff/:staff_id', (req, res) => {
  if (!req.session.staff) return res.redirect('/login');

  const staff_id = req.params.staff_id;

  db.query(
    'SELECT staff_id, staff_name, role, image FROM staff WHERE staff_id = ?',
    [staff_id],
    (err, staffRows) => {
      if (err) throw err;
      if (!staffRows.length) return res.status(404).send('Staff not found');

      const staff = staffRows[0];

      db.query(
        'SELECT timesheet_id, clock_in, break_start, break_end, clock_out, total_hour, date \
         FROM timesheet WHERE staff_id = ? ORDER BY date DESC',
        [staff_id],
        (err2, timesheetRows) => {
          if (err2) throw err2;

          res.render('staff', {
            user: req.session.staff,
            staff,
            timesheet: timesheetRows,
            messages: req.flash('success')
          });
        }
      );
    }
  );
});


































app.listen(3000, () => {
    console.log('Server started on port 3000');
});


