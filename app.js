const express = require('express');
const mysql = require('mysql2');


const session = require('express-session');

const flash = require('connect-flash');

const app = express();


const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Republic_C207',
    database: 'c237_timesheetapp',
    port: 3306,
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to database');
});

app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));


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
    if (req.session.timesheet.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/Admin');
    }
};
app.get('/', (req, res) => {
    res.render('index', { user: req.session.timesheet, messages: req.flash('success') });
});
app.get('/Admin', checkAdmin, (req, res) => {
    if (req.session.timesheet.role === 'admin') {
        res.render('Admin', { user: req.session.timesheet, messages: req.flash('success') });
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/List');
    }
});
app.get('/List', checkAuthenticated, (req, res) => {
    if (req.session.timesheet.role === 'admin') {
        res.redirect('/Admin');
    } else {
        res.render('User', { user: req.session.timesheet, messages: req.flash('success') });
    }
});

app.get('/search', checkAdmin, (req, res) => {
    const searchTerm = req.query.search;
    if (!searchTerm) {
        return res.redirect('/List')
            .json({ error: 'Not Found' });
    }
    const query =
        'SELECT * FROM timesheet WHERE username LIKE ? OR clock_in LIKE ? OR clock_out LIKE ? '
    ' OR break_start LIKE ?  OR break_end LIKE ?  OR total_hour LIKE ?';
    db.query(query, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm],
        (err, results) => {
            if (err) {
                console.error('Error finding', err)
                return res.status(500).json({ error: 'Internal Server Error' });
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
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        req.flash('error', 'All fields are required.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    if (role !== 'admin' && role !== 'user') {
        req.flash('error', 'Invalid role selected.');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }

    next();
};


app.post('/register', validateRegistration, (req, res) => {
    const { username, password, role } = req.body;

    const sql = 'INSERT INTO timesheet (username, password, role) VALUES (?, SHA1(?), ?)';
    db.query(sql, [username, password, role], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                req.flash('error', 'Username already exists.');
                req.flash('formData', req.body);
                return res.redirect('/register');
            }
            throw err;
        }
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/add');
    });
});


app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        req.flash('error', 'Username and password are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM timesheet WHERE username = ? AND password = SHA1(?)';
    db.query(sql, [username, password], (err, results) => {
        if (err) {
            throw err;
        }
        if (results.length > 0) {
            req.session.timesheet = results[0];
            req.flash('success', 'Login successful!');
            res.redirect('/');
        } else {
            req.flash('error', 'Invalid username or password.');
            res.redirect('/login');
        }
    });
});

app.get('/add', (req, res) => {
    if (!req.session.timesheet) return res.redirect('/login');
    res.render('add', { messages: [], formData: {} });
});


app.post('/add', (req, res) => {
    if (!req.session.timesheet) return res.redirect('/login');

    const { clockIn, breakStart, breakEnd, clockOut, totalHour, date } = req.body;
    const username = req.session.timesheet.username;

    const sql = `
        INSERT INTO timesheet (username, clockin, breakstart, breakend, clockout, totalhour, date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [username, clockIn, breakStart, breakEnd, clockOut, totalHour, date], (err) => {
        if (err) throw err;
        req.flash('success', 'Timesheet added! Please log in.');
        res.redirect('/login');
    });
});

// Load the form with current data
app.get('/update/:userId', (req, res) => {
    const userId = req.params.userId;
    const sql = 'SELECT * FROM timesheet WHERE userId = ?';

    db.query(sql, [userId], (error, results) => {
        if (error) {
            console.error('Error retrieving timesheet:', error.message);
            return res.status(500).send('Error retrieving timesheet');
        }

        if (results.length > 0) {
            res.render('update', { user: results[0] });
        } else {
            res.status(404).send('Timesheet not found');
        }
    });
});

// Handle form submission
app.post('/update/:userId', (req, res) => {
    const userId = req.params.userId;
    const { Clock_in, Clock_out, Break_start, Break_end, Total_hour } = req.body;

    const sql = `
        UPDATE timesheet
        SET Clock_in = ?, Clock_out = ?, Break_start = ?, Break_end = ?, Total_hour = ?
        WHERE userId = ?
    `;

    db.query(sql, [Clock_in, Clock_out, Break_start, Break_end, Total_hour, userId], (error, results) => {
        if (error) {
            console.error("Error updating timesheet:", error);
            return res.status(500).send('Error updating timesheet');
        }

        res.redirect('/');
    });
});



// app.get('/deleteUser/:id', (req, res) => {
//     const userId = req.params.id;
//     const sql = 'DELETE FROM users WHERE userId = ?';
//     connection.query(sql, [userId], (error, results) => {
//         if (error) {
//             // Handle any error that occurs during the database operation
//             console.error("Error deleting product:", error);
//             res.status(500).send('Error deleting product');
//         } else {
//             // Send a success response
//             res.redirect('/');
//         }
//     });
// });
































app.listen(3000, () => {
    console.log('Server started on port 3000');
});

