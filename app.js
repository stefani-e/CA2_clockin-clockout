const express = require('express');
const mysql = require('mysql2');
const multer = require('multer');

const session = require('express-session');

const flash = require('connect-flash');

const path = require('path');
const app = express();


const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Republic_C207',
    database: 'ca2_animaloff',
    port: 3306,
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public');
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
app.use(express.static('public'));
;


app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,

}));

app.use(flash());


app.set('view engine', 'ejs');
const checkAuthenticated = (req, res, next) => {
    if (req.session.timesheet) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};
const checkAdmin = (req, res, next) => {
    if (!req.session.timesheet) {
        req.flash('error', 'Please log in first');
        return res.redirect('/login');
    }

    if (req.session.timesheet.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        return res.redirect('/List');
    }
};
app.get('/', (req, res) => {
    res.render('index', { user: req.session.timesheet, messages: req.flash('success') });
});
app.get('/Admin', checkAdmin, (req, res) => {
    const sql = 'SELECT * FROM timesheet';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('DB Error:', err);
            return res.status(500).send('Database Error');
        }
        res.render('Admin', {
            user: req.session.timesheet,
            timesheet: results,
            messages: req.flash('success')
        });
    });
});
app.get('/List', checkAuthenticated, (req, res) => {
    if (req.session.timesheet.role === 'admin') {
        return res.redirect('/Admin');
    }

    const staff_name = req.session.timesheet.staff_name;
    const sql = 'SELECT * FROM timesheet WHERE staff_name = ?';

    db.query(sql, [staff_name], (err, results) => {
        if (err) {
            console.error('Error retrieving user timesheet:', err);
            return res.status(500).send('Database error');
        }

        res.render('List', {
            user: req.session.timesheet,
            timesheet: results,
            messages: req.flash('success')
        });
    });
});

app.get('/search', checkAdmin, (req, res) => {
    const searchTerm = req.query.search;
    if (!searchTerm) {
        return res.redirect('/Admin')
            .json({ error: 'Not Found' });
    }
    
    const query = `
        SELECT * FROM timesheet 
        WHERE LOWER(staff_name) LIKE ?
    `;
     db.query(query, [`%${searchTerm.toLowerCase()}%`],(err, results) => {
            if (err) {
                console.error('Error finding', err)
                return res.status(500).json({ error: 'Staff Not Found' });
            }
            if (results.length > 0) {
                res.render('List', { timesheet: results, user: req.session.timesheet, messages: req.flash('success') });
            } else {
                res.status(404).json({ error: 'No results found' });
            }
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

    const sql = 'INSERT INTO timesheet (staff_name, password, role, image) VALUES (?, SHA1(?), ?, ?)';
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

    const sql = 'SELECT * FROM timesheet WHERE staff_name = ? AND password = SHA1(?)';
    db.query(sql, [staff_name, password], (err, results) => {
        if (err) {
            throw err;
        }
        if (results.length > 0) {
            req.session.timesheet = results[0];
            req.flash('success', 'Login successful!');
            res.redirect('/');
        } else {
            req.flash('error', 'Invalid staff_name or password.');
            res.redirect('/login');
        }
    });
});

app.get('/add', (req, res) => {
    if (!req.session.timesheet) return res.redirect('/login');

    const { staff_id, staff_name } = req.session.timesheet;
    res.render('add', {
        messages: [],
        formData: {},
        staff_id,       // used to set form action
        staff_name      // used to display
    });
});

app.post('/add', (req, res) => {
    if (!req.session.timesheet) return res.redirect('/login');

    const { staff_id, staff_name, clock_in, break_start, break_end, clock_out, total_hour, date } = req.body;

    const sql = `
        INSERT INTO timesheet (staff_id, staff_name, clock_in, break_start, break_end, clock_out, total_hour, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [staff_id, staff_name, clock_in, break_start, break_end, clock_out, total_hour, date], (err) => {
        if (err) throw err;
        req.flash('success', 'Timesheet added!');
        res.redirect('/List');
    });
});


app.get('/add/:staff_id', (req, res) => {
    if (!req.session.timesheet) return res.redirect('/login');

    const staff_id = req.params.staff_id;
    db.query(
        'SELECT staff_name FROM timesheet WHERE staff_id = ?',
        [staff_id],
        (err, results) => {
            if (err) throw err;
            if (!results.length) return res.status(404).send('Staff not found');

            res.render('add', {
                messages: [],
                formData: {},
                staff_id,
                staff_name: results[0].staff_name
            });
        }
    );
});


app.post('/add/:staff_id', (req, res) => {
    if (!req.session.timesheet) return res.redirect('/login');

    const staff_id = req.params.staff_id;
    const {
        staff_name,
        clock_in,
        break_start,
        break_end,
        clock_out,
        total_hour,
        date
    } = req.body;

    const sql = `
    INSERT INTO timesheet
      (staff_id, staff_name, clock_in, break_start, break_end, clock_out, total_hour, date)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `;
    db.query(
        sql,
        [staff_id, staff_name, clock_in, break_start, break_end, clock_out, total_hour, date],
        (err) => {
            if (err) throw err;
            req.flash('success', 'Timesheet added!');
            res.redirect('/Admin');
        }
    );
});


app.get('/update/:staff_id', (req, res) => {
    const staff_id = req.params.staff_id;
    const sql = 'SELECT * FROM timesheet WHERE staff_id = ?';

    db.query(sql, [staff_id], (error, results) => {
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


app.post('/update/:staff_id', (req, res) => {
    const staff_id = req.params.staff_id;
    const { clock_out, clock_in, break_start, break_end, total_hour } = req.body;

    const sql = `
        UPDATE timesheet
        SET clock_out = ?, clock_in = ?, break_start = ?, break_end = ?, total_hour = ?
        WHERE staff_id = ?
    `;

    db.query(sql, [clock_out, clock_in, break_start, break_end, total_hour, staff_id], (error, results) => {
        if (error) {
            console.error("Error updating timesheet:", error);
            return res.status(500).send('Error updating timesheet');
        }

        res.redirect('/List');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/login');
    });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/login');
    });
});

app.get('/deleteUser/:staff_id', (req, res) => {
    const staff_id = req.params.staff_id;
    db.query('DELETE FROM timesheet WHERE staff_id = ?', [staff_id], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting.", error);
            res.status(500).send('Error deleting.');
        } else {
            // Send a success response
            res.redirect('/List');
        }
    });
});
































app.listen(3000, () => {
    console.log('Server started on port 3000');
});


