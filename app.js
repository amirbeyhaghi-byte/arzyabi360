const express = require('express');
const app = express();
const port = 3000;
const fs = require('fs');
const path = require('path');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ایجاد پوشه uploads اگر وجود ندارد
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

app.use('/uploads', express.static(uploadDir));

// ==================== دیتابیس موقت در حافظه ====================
// کاربران سیستم (برای ورود پرسنل)
let systemUsers = {};

const users = {
    'admin': { password: '123456', fullname: 'ادمین', role: 'مدیر ارشد' }
};

let organizationalUnits = [];
let organizationalPositions = [];
let personnel = [];
let nextUnitId = 1;
let nextPositionId = 1;
let nextPersonnelId = 1;

let organizationInfo = {
    name: 'شرکت ایده پردازان',
    logo: null
};

// ==================== دیتابیس سوالات آزمون ====================
let generalQuestions = [];
let specializedQuestions = [];
let nextGeneralId = 1;
let nextSpecializedId = 1;

// ==================== تابع آپلود لوگو ====================
function parseMultipartData(req, callback) {
    let body = [];
    req.on('data', chunk => { body.push(chunk); });
    req.on('end', () => {
        const boundary = req.headers['content-type'].split('boundary=')[1];
        const buffer = Buffer.concat(body);
        const bufferStr = buffer.toString('binary');
        let result = {};
        
        const nameMatch = bufferStr.match(/name="orgName"\r\n\r\n([^\r\n]+)/);
        if (nameMatch) result.orgName = decodeURIComponent(escape(nameMatch[1]));
        
        const fileMatch = bufferStr.match(/name="logo"; filename="([^"]+)"/);
        if (fileMatch) {
            const fileName = fileMatch[1];
            const ext = path.extname(fileName);
            const newFileName = 'logo-' + Date.now() + ext;
            const fileStart = bufferStr.indexOf('\r\n\r\n', bufferStr.indexOf('name="logo"')) + 4;
            let fileEnd = bufferStr.indexOf('--' + boundary, fileStart);
            let fileContent = bufferStr.substring(fileStart, fileEnd);
            fileContent = fileContent.replace(/\r\n$/, '');
            const fileBuffer = Buffer.from(fileContent, 'binary');
            const filePath = path.join(uploadDir, newFileName);
            fs.writeFileSync(filePath, fileBuffer);
            result.logoUrl = '/uploads/' + newFileName;
        }
        
        const userMatch = bufferStr.match(/name="username"\r\n\r\n([^\r\n]+)/);
        if (userMatch) result.username = userMatch[1];
        callback(result);
    });
}

// ==================== تابع همگام‌سازی کاربران از پرسنل ====================
function syncUsersFromPersonnel() {
    for (const p of personnel) {
        const nationalCode = p.nationalCode;
        if (!systemUsers[nationalCode] && nationalCode) {
            systemUsers[nationalCode] = {
                password: '',
                fullname: p.fullname,
                personnelCode: p.personnelCode,
                unit: p.unit,
                position: p.position,
                role: 'پرسنل',
                accessLevel: 'normal'
            };
        } else if (systemUsers[nationalCode] && nationalCode) {
            systemUsers[nationalCode].fullname = p.fullname;
            systemUsers[nationalCode].personnelCode = p.personnelCode;
            systemUsers[nationalCode].unit = p.unit;
            systemUsers[nationalCode].position = p.position;
        }
    }
}

// ==================== صفحات ====================

// صفحه ورود
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>ورود به سامانه</title>
            <style>
                body {
                    font-family: 'Vazirmatn', 'Segoe UI', 'IRANSans', Tahoma, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    margin: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .login-box {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                    text-align: center;
                    width: 350px;
                }
                .logo-area { margin-bottom: 20px; }
                .logo-area img { max-width: 120px; max-height: 80px; }
                h1 { color: #333; margin-bottom: 10px; font-weight: bold; }
                .company { color: #4CAF50; margin-bottom: 30px; font-weight: bold; font-size: 18px; }
                input {
                    width: 100%;
                    padding: 12px;
                    margin: 10px 0;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    box-sizing: border-box;
                }
                button {
                    background: #4CAF50;
                    color: white;
                    padding: 12px 30px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 16px;
                    margin-top: 10px;
                }
                button:hover { background: #45a049; }
                .info { margin-top: 20px; font-size: 12px; color: #888; }
            </style>
        </head>
        <body>
            <div class="login-box">
                <div class="logo-area">${organizationInfo.logo ? `<img src="${organizationInfo.logo}" alt="logo">` : ''}</div>
                <h1>سامانه ارزیابی عملکرد</h1>
                <div class="company">${organizationInfo.name}</div>
                <form method="POST" action="/login">
                    <input type="text" name="username" placeholder="نام کاربری (کد ملی)" required>
                    <input type="password" name="password" placeholder="رمز عبور" required>
                    <button type="submit">ورود به سامانه</button>
                </form>
                <div class="info">نام کاربری: admin<br>رمز عبور: 123456</div>
            </div>
        </body>
        </html>
    `);
});

app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    
    if (users[username] && users[username].password === password) {
        return res.redirect("/dashboard?user=" + username + "&role=admin");
    }
    
    if (systemUsers[username] && systemUsers[username].password === password) {
        const accessLevel = systemUsers[username].accessLevel || 'normal';
        return res.redirect("/dashboard?user=" + username + "&role=" + accessLevel);
    }
    
    res.send('<h2 style="color: red;">نام کاربری یا رمز عبور اشتباه است!</h2><a href="/">بازگشت</a>');
});

// صفحه داشبورد اصلی
app.get('/dashboard', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    let user;
    let isManagement = false;
    
    if (role === 'admin') {
        user = users[username];
        isManagement = true;
    } else {
        user = systemUsers[username];
        isManagement = (role === 'management');
    }
    
    if (!user) return res.redirect('/');
    
    const now = new Date();
    const time = now.toLocaleTimeString('fa-IR');
    const date = now.toLocaleDateString('fa-IR');
    
    let menuItems = '';
    if (role === 'admin') {
        menuItems = `
            <div class="icon-card" onclick="location.href='/hr?user=${username}&role=${role}'">
                <div class="icon">🏢</div>
                <div class="icon-title">واحد منابع انسانی</div>
                <div class="icon-desc">مدیریت پرسنل و چارت</div>
            </div>
            <div class="icon-card" onclick="alert('در حال تکمیل...')">
                <div class="icon">📋</div>
                <div class="icon-title">شروع آزمون عمومی</div>
                <div class="icon-desc">ارزیابی مهارت‌های عمومی</div>
            </div>
            <div class="icon-card" onclick="alert('در حال تکمیل...')">
                <div class="icon">🎯</div>
                <div class="icon-title">شروع آزمون تخصصی</div>
                <div class="icon-desc">ارزیابی مهارت‌های تخصصی</div>
            </div>
        `;
    } else if (isManagement) {
        menuItems = `
            <div class="icon-card" onclick="location.href='/hr?user=${username}&role=management'">
                <div class="icon">🏢</div>
                <div class="icon-title">واحد منابع انسانی</div>
                <div class="icon-desc">مدیریت پرسنل و چارت</div>
            </div>
            <div class="icon-card" onclick="alert('در حال تکمیل...')">
                <div class="icon">📋</div>
                <div class="icon-title">شروع آزمون عمومی</div>
                <div class="icon-desc">ارزیابی مهارت‌های عمومی</div>
            </div>
            <div class="icon-card" onclick="alert('در حال تکمیل...')">
                <div class="icon">🎯</div>
                <div class="icon-title">شروع آزمون تخصصی</div>
                <div class="icon-desc">ارزیابی مهارت‌های تخصصی</div>
            </div>
        `;
    } else {
        menuItems = `
            <div class="icon-card" onclick="alert('در حال تکمیل...')">
                <div class="icon">📋</div>
                <div class="icon-title">شروع آزمون عمومی</div>
                <div class="icon-desc">ارزیابی مهارت‌های عمومی</div>
            </div>
            <div class="icon-card" onclick="alert('در حال تکمیل...')">
                <div class="icon">🎯</div>
                <div class="icon-title">شروع آزمون تخصصی</div>
                <div class="icon-desc">ارزیابی مهارت‌های تخصصی</div>
            </div>
            <div class="icon-card" onclick="alert('در حال تکمیل...')">
                <div class="icon">📊</div>
                <div class="icon-title">کارنامه ارزیابی فردی</div>
                <div class="icon-desc">مشاهده کارنامه عملکرد</div>
            </div>
        `;
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>داشبورد - ارزیابی 360 درجه</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Vazirmatn', 'Segoe UI', 'IRANSans', Tahoma, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                }
                .header {
                    background: rgba(255,255,255,0.95);
                    padding: 20px 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .logo-header { display: flex; align-items: center; gap: 15px; }
                .logo-header img { max-height: 40px; }
                .company-name { font-size: 1rem; color: #4CAF50; font-weight: bold; }
                .welcome-message { font-size: 1.2rem; color: #333; font-weight: bold; text-align: center; flex: 1; }
                .logout-btn {
                    background: #ff4444;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: bold;
                }
                .logout-btn:hover { background: #cc0000; }
                .icons-container {
                    display: flex;
                    justify-content: center;
                    gap: 40px;
                    padding: 60px 20px;
                    flex-wrap: wrap;
                }
                .icon-card {
                    background: white;
                    width: 260px;
                    padding: 35px 20px;
                    border-radius: 20px;
                    text-align: center;
                    cursor: pointer;
                    transition: 0.3s;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                .icon-card:hover { transform: translateY(-10px); }
                .icon { font-size: 4.5rem; margin-bottom: 15px; }
                .icon-title { font-size: 1.3rem; font-weight: bold; color: #333; margin-bottom: 10px; }
                .icon-desc { font-size: 0.85rem; color: #666; }
                .footer {
                    background: rgba(0,0,0,0.8);
                    color: white;
                    padding: 15px 30px;
                    text-align: left;
                    position: fixed;
                    bottom: 0;
                    width: 100%;
                    font-family: monospace;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo-header">
                    ${organizationInfo.logo ? `<img src="${organizationInfo.logo}" alt="logo">` : ''}
                    <span class="company-name">${organizationInfo.name}</span>
                </div>
                <div class="welcome-message">به سامانه ارزیابی عملکرد 360 درجه پرسنل خوش آمدید</div>
                <button class="logout-btn" onclick="location.href='/'">🚪 خروج از پنل کاربری</button>
            </div>
            <div class="icons-container">
                ${menuItems}
            </div>
            <div class="footer">🕒 ${date} - ${time}</div>
        </body>
        </html>
    `);
});

// ==================== صفحه اصلی منابع انسانی ====================
app.get('/hr', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    if (role !== 'admin' && role !== 'management') return res.redirect('/');
    
    let user;
    if (role === 'admin') {
        user = users[username];
    } else {
        user = systemUsers[username];
    }
    
    if (!user) return res.redirect('/');
    
    const now = new Date();
    const time = now.toLocaleTimeString('fa-IR');
    const date = now.toLocaleDateString('fa-IR');
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>منابع انسانی</title>
            <style>
                body {
                    font-family: 'Vazirmatn', 'Segoe UI', 'IRANSans', Tahoma, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    margin: 0;
                    padding: 20px;
                    min-height: 100vh;
                }
                .container { max-width: 1400px; margin: 0 auto; }
                .header {
                    background: rgba(255,255,255,0.95);
                    padding: 20px;
                    border-radius: 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 40px;
                }
                .welcome-message { font-size: 1.2rem; color: #333; font-weight: bold; text-align: center; flex: 1; }
                .back-btn { background: #666; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
                .icons-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 25px;
                    margin: 40px 0;
                }
                .icon-card {
                    background: white;
                    padding: 30px 15px;
                    border-radius: 20px;
                    text-align: center;
                    cursor: pointer;
                    transition: 0.3s;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                }
                .icon-card:hover { transform: translateY(-10px); }
                .icon { font-size: 3.5rem; margin-bottom: 15px; }
                .icon-title { font-size: 1.1rem; font-weight: bold; color: #333; margin-bottom: 8px; }
                .icon-desc { font-size: 0.75rem; color: #666; }
                .badge-coming {
                    display: inline-block;
                    background: #ff9800;
                    color: white;
                    font-size: 0.7rem;
                    padding: 3px 8px;
                    border-radius: 20px;
                    margin-top: 10px;
                }
                .footer {
                    background: rgba(0,0,0,0.8);
                    color: white;
                    padding: 15px;
                    border-radius: 10px;
                    text-align: left;
                    margin-top: 40px;
                }
                @media (max-width: 1200px) {
                    .icons-grid { grid-template-columns: repeat(3, 1fr); }
                }
                @media (max-width: 768px) {
                    .icons-grid { grid-template-columns: repeat(2, 1fr); }
                }
                @media (max-width: 500px) {
                    .icons-grid { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="welcome-message">به سامانه ارزیابی عملکرد 360 درجه پرسنل خوش آمدید</div>
                    <button class="back-btn" onclick="location.href='/dashboard?user=${username}&role=${role}'">← بازگشت به داشبورد</button>
                </div>
                
                <div class="icons-grid">
                    <div class="icon-card" onclick="location.href='/hr/organization?user=${username}&role=${role}'">
                        <div class="icon">🏛️</div>
                        <div class="icon-title">تعریف اطلاعات سازمان</div>
                        <div class="icon-desc">تعریف مشخصات، واحدها و پستهای سازمانی</div>
                    </div>
                    
                    <div class="icon-card" onclick="location.href='/hr/personnel/add?user=${username}&role=${role}'">
                        <div class="icon">👫</div>
                        <div class="icon-title">تعریف پرسنل</div>
                        <div class="icon-desc">ثبت اطلاعات پرسنل جدید</div>
                    </div>
                    
                    <div class="icon-card" onclick="location.href='/hr/personnel/list?user=${username}&role=${role}'">
                        <div class="icon">📋</div>
                        <div class="icon-title">لیست پرسنل</div>
                        <div class="icon-desc">مشاهده و جستجوی پرسنل</div>
                    </div>
                    
                    <div class="icon-card" onclick="location.href='/hr/general-questions?user=${username}&role=${role}'">
                        <div class="icon">📝</div>
                        <div class="icon-title">ثبت سوالات آزمون عمومی</div>
                        <div class="icon-desc">تعریف سوالات آزمون عمومی</div>
                    </div>
                    
                    <div class="icon-card" onclick="location.href='/hr/specialized-questions?user=${username}&role=${role}'">
                        <div class="icon">🎓</div>
                        <div class="icon-title">ثبت سوالات آزمون تخصصی</div>
                        <div class="icon-desc">تعریف سوالات آزمون تخصصی</div>
                    </div>
                    
                    <div class="icon-card" onclick="location.href='/user-management?user=${username}&role=${role}'">
                        <div class="icon">👤🔒🔑</div>
                        <div class="icon-title">اطلاعات وضعیت کاربران</div>
                        <div class="icon-desc">نام کاربری، رمز عبور و سطح دسترسی ها</div>
                    </div>
                    
                    <div class="icon-card" onclick="alert('⏳ این بخش در حال تکمیل است...')">
                        <div class="icon">📊</div>
                        <div class="icon-title">کارنامه ارزیابی فردی پرسنل</div>
                        <div class="icon-desc">مشاهده کارنامه عملکرد هر پرسنل</div>
                        <div class="badge-coming">در حال تکمیل</div>
                    </div>
                    
                    <div class="icon-card" onclick="alert('⏳ این بخش در حال تکمیل است...')">
                        <div class="icon">📈</div>
                        <div class="icon-title">کارنامه کلی جهت مدیران</div>
                        <div class="icon-desc">گزارش‌های تجمیعی و تحلیلی</div>
                        <div class="badge-coming">در حال تکمیل</div>
                    </div>
                </div>
                
                <div class="footer">
                    🕒 ${date} - ${time}
                </div>
            </div>
        </body>
        </html>
    `);
});
// ==================== صفحه مدیریت وضعیت کاربران ====================
app.get('/user-management', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    if (role !== 'admin' && role !== 'management') return res.redirect('/');
    
    syncUsersFromPersonnel();
    
    // ساخت ردیف‌های جدول در سمت سرور
    let rows = '';
    for (const [nationalCode, user] of Object.entries(systemUsers)) {
        const currentAccessLevel = user.accessLevel || 'normal';
        const selectedNormal = (currentAccessLevel === 'normal') ? 'selected' : '';
        const selectedManagement = (currentAccessLevel === 'management') ? 'selected' : '';
        
        rows += '<tr>';
        rows += '<td style="text-align:center">' + user.fullname + '</td>';
        rows += '<td style="text-align:center">' + (user.personnelCode || '-') + '</td>';
        rows += '<td style="text-align:center">' + (user.unit || '-') + '</td>';
        rows += '<td style="text-align:center">' + (user.position || '-') + '</td>';
        rows += '<td style="text-align:center">' + nationalCode + '</td>';
        rows += '<td style="text-align:center">';
        rows += '<input type="password" id="pass_' + nationalCode + '" value="' + (user.password || '') + '" placeholder="رمز عبور" style="width:100px; padding:5px;">';
        rows += '<button class="btn-save" onclick="savePassword(\'' + nationalCode + '\')">ذخیره</button>';
        rows += '</td>';
        rows += '<td style="text-align:center">';
        rows += '<select id="level_' + nationalCode + '">';
        rows += '<option value="normal" ' + selectedNormal + '>عادی</option>';
        rows += '<option value="management" ' + selectedManagement + '>مدیریتی</option>';
        rows += '</select>';
        rows += '<button class="btn-save-level" onclick="saveAccessLevel(\'' + nationalCode + '\')">ذخیره</button>';
        rows += '</td>';
        rows += '</tr>';
    }
    
    if (Object.keys(systemUsers).length === 0) {
        rows = '<tr><td colspan="7" style="text-align:center; padding:30px;">هیچ پرسنلی تعریف نشده است. ابتدا در بخش لیست پرسنل، پرسنل را تعریف کنید.</td></tr>';
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>مدیریت کاربران</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Vazirmatn', 'Segoe UI', 'IRANSans', Tahoma, sans-serif;
                    background: #f0f2f5;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 1400px;
                    margin: 0 auto;
                    background: white;
                    padding: 25px;
                    border-radius: 15px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header-buttons {
                    text-align: left;
                    margin-bottom: 20px;
                }
                .btn {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    margin: 5px;
                    font-size: 14px;
                }
                .btn-save {
                    background: #2196F3;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-left: 5px;
                }
                .btn-save-level {
                    background: #ff9800;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-left: 5px;
                }
                .btn-back { background: #666; }
                .btn-refresh { background: #ff9800; }
                .search-box {
                    display: flex;
                    gap: 10px;
                    margin: 20px 0;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .search-box input {
                    flex: 2;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                }
                .search-box select {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th {
                    background: #4CAF50;
                    color: white;
                    padding: 12px;
                    text-align: center;
                    border: 1px solid #ddd;
                }
                td {
                    padding: 10px;
                    text-align: center;
                    border: 1px solid #ddd;
                    vertical-align: middle;
                }
                .stats {
                    background: #e8f5e9;
                    padding: 10px;
                    border-radius: 6px;
                    margin: 15px 0;
                    font-weight: bold;
                }
                .table-container {
                    max-height: 500px;
                    overflow-y: auto;
                    border: 1px solid #ccc;
                    border-radius: 8px;
                }
                h1 {
                    color: #333;
                    margin-bottom: 20px;
                    font-size: 22px;
                }
                .info-box {
                    background: #e3f2fd;
                    padding: 15px;
                    border-radius: 10px;
                    margin: 20px 0;
                    border-right: 4px solid #2196F3;
                    line-height: 1.8;
                    font-size: 13px;
                }
                select, input {
                    padding: 5px 8px;
                    border-radius: 4px;
                    border: 1px solid #ddd;
                }
                button:hover { opacity: 0.85; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header-buttons">
                    <button class="btn btn-back" onclick="location.href='/hr?user=${username}&role=${role}'">← بازگشت به منابع انسانی</button>
                    <button class="btn btn-refresh" onclick="location.reload()">🔄 بروزرسانی</button>
                </div>
                <h1>👤 مدیریت کاربران سیستم</h1>
                
                <div class="info-box">
                    <strong>📌 راهنما:</strong><br>
                    • هر پرسنلی که در بخش "لیست پرسنل" تعریف شود، به طور خودکار در این لیست قرار می‌گیرد.<br>
                    • <strong>نام کاربری</strong> هر فرد، <strong>کد ملی</strong> او می‌باشد.<br>
                    • برای فعال کردن حساب کاربری، رمز عبور تعیین کنید و دکمه ذخیره را بزنید.<br>
                    • <strong>سطح دسترسی "مدیریتی"</strong> دسترسی کامل به واحد منابع انسانی را می‌دهد.
                </div>
                
                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="جستجو..." onkeyup="searchTable()">
                    <select id="searchField">
                        <option value="all">همه ستون‌ها</option>
                        <option value="0">نام و نام خانوادگی</option>
                        <option value="1">کد پرسنلی</option>
                        <option value="2">واحد خدمتی</option>
                        <option value="3">پست سازمانی</option>
                        <option value="4">کد ملی</option>
                    </select>
                    <button class="btn" onclick="clearSearch()">پاک کردن</button>
                </div>
                
                <div class="stats" id="stats">📊 تعداد کل کاربران: ${Object.keys(systemUsers).length} نفر</div>
                
                <div class="table-container">
                    <table id="usersTable">
                        <thead>
                            <tr>
                                <th>نام و نام خانوادگی</th>
                                <th>کد پرسنلی</th>
                                <th>واحد خدمتی</th>
                                <th>پست سازمانی</th>
                                <th>نام کاربری (کد ملی)</th>
                                <th>رمز عبور</th>
                                <th>سطح دسترسی</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody">${rows}</tbody>
                    </table>
                </div>
            </div>
            
            <script>
                // ذخیره داده‌های اولیه برای جستجو
                const allUsers = ${JSON.stringify(Object.entries(systemUsers).map(([code, u]) => ({
                    nationalCode: code,
                    fullname: u.fullname,
                    personnelCode: u.personnelCode || '-',
                    unit: u.unit || '-',
                    position: u.position || '-',
                    password: u.password || '',
                    accessLevel: u.accessLevel || 'normal'
                })))};
                
                function searchTable() {
                    const term = document.getElementById('searchInput').value.toLowerCase();
                    const fieldIndex = parseInt(document.getElementById('searchField').value);
                    const tbody = document.getElementById('tableBody');
                    const rows = tbody.getElementsByTagName('tr');
                    let visibleCount = 0;
                    
                    for (let i = 0; i < rows.length; i++) {
                        const row = rows[i];
                        let showRow = false;
                        
                        if (fieldIndex === 'all' || isNaN(fieldIndex)) {
                            // جستجو در همه ستون‌ها
                            for (let j = 0; j < row.cells.length - 2; j++) {
                                const cellText = row.cells[j].innerText.toLowerCase();
                                if (cellText.includes(term)) {
                                    showRow = true;
                                    break;
                                }
                            }
                        } else {
                            // جستجو در ستون خاص
                            if (row.cells[fieldIndex]) {
                                const cellText = row.cells[fieldIndex].innerText.toLowerCase();
                                showRow = cellText.includes(term);
                            }
                        }
                        
                        if (term === '') showRow = true;
                        
                        if (showRow) {
                            row.style.display = '';
                            visibleCount++;
                        } else {
                            row.style.display = 'none';
                        }
                    }
                    
                    document.getElementById('stats').innerHTML = '📊 تعداد کل کاربران: ' + allUsers.length + ' | نمایش: ' + visibleCount;
                }
                
                function clearSearch() {
                    document.getElementById('searchInput').value = '';
                    searchTable();
                }
                
                async function savePassword(nationalCode) {
                    const password = document.getElementById('pass_' + nationalCode).value;
                    if (!password) {
                        alert('لطفاً رمز عبور را وارد کنید');
                        return;
                    }
                    
                    const res = await fetch('/api/user/password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nationalCode: nationalCode, password: password })
                    });
                    const result = await res.json();
                    if (result.success) {
                        alert('✅ رمز عبور با موفقیت ذخیره شد');
                        location.reload();
                    } else {
                        alert('❌ خطا: ' + (result.message || 'مشخص نیست'));
                    }
                }
                
                async function saveAccessLevel(nationalCode) {
                    const accessLevel = document.getElementById('level_' + nationalCode).value;
                    const res = await fetch('/api/user/access-level', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nationalCode: nationalCode, accessLevel: accessLevel })
                    });
                    const result = await res.json();
                    if (result.success) {
                        alert('✅ سطح دسترسی با موفقیت ذخیره شد');
                        location.reload();
                    } else {
                        alert('❌ خطا: ' + (result.message || 'مشخص نیست'));
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// ==================== API مدیریت رمز عبور و سطح دسترسی کاربران ====================
app.post('/api/user/password', (req, res) => {
    const { nationalCode, password } = req.body;
    
    if (!nationalCode || !password) {
        return res.json({ success: false, message: 'اطلاعات ناقص است' });
    }
    
    if (systemUsers[nationalCode]) {
        systemUsers[nationalCode].password = password;
        res.json({ success: true, message: 'رمز عبور با موفقیت ذخیره شد' });
    } else {
        res.json({ success: false, message: 'کاربر یافت نشد' });
    }
});

app.post('/api/user/access-level', (req, res) => {
    const { nationalCode, accessLevel } = req.body;
    
    if (!nationalCode || !accessLevel) {
        return res.json({ success: false, message: 'اطلاعات ناقص است' });
    }
    
    if (systemUsers[nationalCode]) {
        systemUsers[nationalCode].accessLevel = accessLevel;
        res.json({ success: true, message: 'سطح دسترسی با موفقیت ذخیره شد' });
    } else {
        res.json({ success: false, message: 'کاربر یافت نشد' });
    }
});

// ==================== صفحه تعریف اطلاعات سازمان ====================
app.get('/hr/organization', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    if (role !== 'admin' && role !== 'management') return res.redirect('/');
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>تعریف اطلاعات سازمان</title>
            <style>
                body { font-family: 'Vazirmatn', 'Segoe UI', 'IRANSans', Tahoma, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 25px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .btn { background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin: 5px; }
                .btn-back { background: #666; }
                .btn-import { background: #2196F3; }
                .btn-import:hover { background: #0b7dda; }
                .form-box { background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0; }
                input { width: 100%; padding: 8px; margin: 8px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
                .preview-logo { max-width: 150px; max-height: 100px; margin: 10px 0; border: 1px solid #ddd; padding: 5px; }
                .item-with-delete { background: #e8f5e9; padding: 8px 12px; margin: 5px; display: inline-flex; align-items: center; gap: 8px; border-radius: 20px; }
                .delete-icon { color: #ff4444; cursor: pointer; font-weight: bold; font-size: 18px; margin-right: 8px; }
                .delete-icon:hover { color: #cc0000; }
                h2 { color: #555; border-bottom: 2px solid #eee; padding-bottom: 10px; font-weight: bold; }
                h3 { font-weight: bold; }
                .list-container { max-height: 300px; overflow-y: auto; margin: 15px 0; padding: 10px; border: 1px solid #eee; border-radius: 8px; }
                .import-box {
                    background: #e3f2fd;
                    padding: 15px;
                    border-radius: 10px;
                    margin: 15px 0;
                    border: 1px dashed #2196F3;
                }
                .import-box textarea {
                    width: 100%;
                    padding: 8px;
                    font-family: monospace;
                    font-size: 12px;
                    direction: ltr;
                    text-align: left;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    margin: 10px 0;
                }
                .import-box small {
                    color: #666;
                    font-size: 11px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="text-align: left; margin-bottom: 20px;">
                    <button class="btn btn-back" onclick="location.href='/hr?user=${username}&role=${role}'">← بازگشت به منابع انسانی</button>
                </div>
                <h1 style="font-weight: bold;">🏛️ تعریف اطلاعات سازمان</h1>
                <div class="form-box">
                    <h3>🏢 اطلاعات سازمان</h3>
                    <form method="POST" action="/hr/update-organization" enctype="multipart/form-data">
                        <label style="font-weight: bold;">نام سازمان/شرکت:</label>
                        <input type="text" name="orgName" value="${organizationInfo.name}" required>
                        <label style="font-weight: bold;">آپلود لوگو:</label>
                        <input type="file" name="logo" accept="image/*">
                        ${organizationInfo.logo ? `<div><img src="${organizationInfo.logo}" class="preview-logo"></div>` : ''}
                        <button type="submit" class="btn">💾 ذخیره اطلاعات سازمان</button>
                    </form>
                </div>
                
                <h2>📊 واحدهای سازمانی</h2>
                <div class="import-box">
                    <h3>📎 ایمپورت واحدها از اکسل</h3>
                    <textarea id="importUnits" rows="3" placeholder="هر واحد در یک خط&#10;منابع انسانی&#10;فنی و مهندسی&#10;مالی و اداری&#10;بازاریابی"></textarea>
                    <button class="btn btn-import" onclick="importUnits()">📥 ایمپورت واحدها</button>
                    <small>راهنما: هر نام واحد را در یک خط وارد کنید. واحدهای تکراری ثبت نمی‌شوند.</small>
                </div>
                
                <div class="form-box">
                    <h3>➕ افزودن واحد سازمانی (دستی)</h3>
                    <form method="POST" action="/hr/add-unit">
                        <input type="text" name="unitName" placeholder="مثال: واحد منابع انسانی" required>
                        <input type="hidden" name="username" value="${username}">
                        <button type="submit" class="btn">ثبت واحد</button>
                    </form>
                </div>
                <div class="list-container">
                    ${organizationalUnits.length === 0 ? '<span style="color:gray;">هنوز واحدی تعریف نشده است</span>' : 
                        organizationalUnits.map(u => `<div class="item-with-delete"><span class="delete-icon" onclick="if(confirm('حذف شود؟')) fetch('/hr/delete-unit?id=${u.id}&user=${username}&role=${role}').then(()=>location.reload())">🗑️</span><span>${u.name}</span></div>`).join('')
                    }
                </div>
                
                <h2>💼 پست‌های سازمانی</h2>
                <div class="import-box">
                    <h3>📎 ایمپورت پست‌ها از اکسل</h3>
                    <textarea id="importPositions" rows="3" placeholder="هر پست در یک خط&#10;مدیر&#10;کارشناس&#10;کارشناس ارشد&#10;سرپرست"></textarea>
                    <button class="btn btn-import" onclick="importPositions()">📥 ایمپورت پست‌ها</button>
                    <small>راهنما: هر نام پست را در یک خط وارد کنید. پست‌های تکراری ثبت نمی‌شوند.</small>
                </div>
                
                <div class="form-box">
                    <h3>➕ افزودن پست سازمانی (دستی)</h3>
                    <form method="POST" action="/hr/add-position">
                        <input type="text" name="positionName" placeholder="مثال: مدیر منابع انسانی" required>
                        <input type="hidden" name="username" value="${username}">
                        <button type="submit" class="btn">ثبت پست</button>
                    </form>
                </div>
                <div class="list-container">
                    ${organizationalPositions.length === 0 ? '<span style="color:gray;">هنوز پستی تعریف نشده است</span>' : 
                        organizationalPositions.map(p => `<div class="item-with-delete"><span class="delete-icon" onclick="if(confirm('حذف شود؟')) fetch('/hr/delete-position?id=${p.id}&user=${username}&role=${role}').then(()=>location.reload())">🗑️</span><span>${p.name}</span></div>`).join('')
                    }
                </div>
            </div>
            <script>
                let currentUser = '${username}';
                let currentRole = '${role}';
                
                async function importUnits() {
                    const raw = document.getElementById('importUnits').value;
                    const lines = raw.trim().split(/\\r?\\n/);
                    let success = 0;
                    let fail = 0;
                    let errors = [];
                    
                    const existingUnits = ${JSON.stringify(organizationalUnits.map(u => u.name))};
                    
                    for (let i = 0; i < lines.length; i++) {
                        const unitName = lines[i].trim();
                        if (unitName === '') continue;
                        
                        if (existingUnits.includes(unitName)) {
                            fail++;
                            errors.push('واحد "' + unitName + '" تکراری است');
                            continue;
                        }
                        
                        const res = await fetch('/hr/add-unit-batch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ unitName, username: currentUser })
                        });
                        const result = await res.json();
                        if (result.success) {
                            success++;
                        } else {
                            fail++;
                            errors.push('واحد "' + unitName + '": ' + (result.message || 'خطا'));
                        }
                    }
                    
                    let message = '✅ ایمپورت واحدها انجام شد!\\n';
                    message += 'موفق: ' + success + '\\n';
                    message += 'ناموفق: ' + fail;
                    if (errors.length > 0 && errors.length <= 5) {
                        message += '\\n\\n❌ خطاها:\\n' + errors.join('\\n');
                    }
                    alert(message);
                    location.reload();
                }
                
                async function importPositions() {
                    const raw = document.getElementById('importPositions').value;
                    const lines = raw.trim().split(/\\r?\\n/);
                    let success = 0;
                    let fail = 0;
                    let errors = [];
                    
                    const existingPositions = ${JSON.stringify(organizationalPositions.map(p => p.name))};
                    
                    for (let i = 0; i < lines.length; i++) {
                        const positionName = lines[i].trim();
                        if (positionName === '') continue;
                        
                        if (existingPositions.includes(positionName)) {
                            fail++;
                            errors.push('پست "' + positionName + '" تکراری است');
                            continue;
                        }
                        
                        const res = await fetch('/hr/add-position-batch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ positionName, username: currentUser })
                        });
                        const result = await res.json();
                        if (result.success) {
                            success++;
                        } else {
                            fail++;
                            errors.push('پست "' + positionName + '": ' + (result.message || 'خطا'));
                        }
                    }
                    
                    let message = '✅ ایمپورت پست‌ها انجام شد!\\n';
                    message += 'موفق: ' + success + '\\n';
                    message += 'ناموفق: ' + fail;
                    if (errors.length > 0 && errors.length <= 5) {
                        message += '\\n\\n❌ خطاها:\\n' + errors.join('\\n');
                    }
                    alert(message);
                    location.reload();
                }
            </script>
        </body>
        </html>
    `);
});

app.post('/hr/update-organization', (req, res) => {
    parseMultipartData(req, (result) => {
        if (result.orgName) organizationInfo.name = result.orgName;
        if (result.logoUrl) organizationInfo.logo = result.logoUrl;
        const username = result.username || 'admin';
        res.redirect("/hr/organization?user=" + username + "&role=admin");
    });
});

// ==================== ایمپورت دسته‌جمعی واحدها و پست‌ها ====================
app.post('/hr/add-unit-batch', (req, res) => {
    const { unitName, username } = req.body;
    if (unitName && !organizationalUnits.find(u => u.name === unitName)) {
        organizationalUnits.push({ id: nextUnitId++, name: unitName });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'نام واحد معتبر نیست یا تکراری است' });
    }
});

app.post('/hr/add-position-batch', (req, res) => {
    const { positionName, username } = req.body;
    if (positionName && !organizationalPositions.find(p => p.name === positionName)) {
        organizationalPositions.push({ id: nextPositionId++, name: positionName });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'نام پست معتبر نیست یا تکراری است' });
    }
});

// ==================== صفحه تعریف پرسنل ====================
app.get('/hr/personnel/add', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    if (role !== 'admin' && role !== 'management') return res.redirect('/');
    
    const unitOptions = organizationalUnits.map(unit => `<option value="${unit.name}">${unit.name}</option>`).join('');
    const positionOptions = organizationalPositions.map(pos => `<option value="${pos.name}">${pos.name}</option>`).join('');
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>تعریف پرسنل جدید</title>
            <style>
                body { font-family: 'Vazirmatn', 'Segoe UI', 'IRANSans', Tahoma, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 25px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .btn { background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 5px; width: 100%; }
                .btn-back { background: #666; width: auto; }
                .form-group { margin-bottom: 15px; }
                label { font-weight: bold; display: block; margin-bottom: 5px; }
                input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
                h1 { color: #333; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="text-align: left; margin-bottom: 20px;">
                    <button class="btn btn-back" onclick="location.href='/hr?user=${username}&role=${role}'">← بازگشت به منابع انسانی</button>
                </div>
                <h1>👫 تعریف پرسنل جدید</h1>
                <form method="POST" action="/hr/add-personnel" onsubmit="return validateNationalCode()">
                    <div class="form-group"><label>نام و نام خانوادگی:</label><input type="text" name="fullname" required></div>
                    <div class="form-group"><label>کد پرسنلی:</label><input type="text" name="personnelCode" required></div>
                    <div class="form-group"><label>واحد محل خدمتی:</label><select name="unit" required><option value="">-- انتخاب کنید --</option>${unitOptions || '<option>ابتدا واحد تعریف کنید</option>'}</select></div>
                    <div class="form-group"><label>پست سازمانی:</label><select name="position" required><option value="">-- انتخاب کنید --</option>${positionOptions || '<option>ابتدا پست تعریف کنید</option>'}</select></div>
                    <div class="form-group"><label>کد ملی (10 رقم):</label><input type="text" name="nationalCode" id="nationalCode" required pattern="[0-9]{10}" title="کد ملی باید 10 رقم باشد" maxlength="10"></div>
                    <input type="hidden" name="username" value="${username}">
                    <button type="submit" class="btn">ثبت پرسنل</button>
                </form>
            </div>
            <script>
                function validateNationalCode() {
                    const nationalCode = document.getElementById('nationalCode').value;
                    if (!/^[0-9]{10}$/.test(nationalCode)) {
                        alert('کد ملی باید دقیقاً 10 رقم باشد!');
                        return false;
                    }
                    return true;
                }
            </script>
        </body>
        </html>
    `);
});

// ==================== صفحه لیست پرسنل ====================
app.get('/hr/personnel/list', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    if (role !== 'admin' && role !== 'management') return res.redirect('/');
    
    const hasChartData = organizationalUnits.length > 0 && organizationalPositions.length > 0;
    const validUnits = organizationalUnits.map(u => u.name);
    const validPositions = organizationalPositions.map(p => p.name);
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>لیست پرسنل</title>
            <style>
                body { font-family: 'Vazirmatn', 'Segoe UI', 'IRANSans', Tahoma, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
                .container { max-width: 1300px; margin: 0 auto; background: white; padding: 25px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .btn { background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin: 5px; }
                .btn-back { background: #666; }
                .btn-danger { background: #ff4444; padding: 5px 10px; border-radius: 5px; cursor: pointer; border: none; color: white; }
                .btn-danger:hover { background: #cc0000; }
                .btn-disabled { background: #ccc; cursor: not-allowed; }
                .btn-sync { background: #ff9800; }
                .import-box { background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0; border: 1px dashed #4CAF50; }
                .warning-box { background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 12px; border-radius: 8px; margin: 10px 0; font-size: 13px; }
                textarea { width: 100%; padding: 10px; font-family: monospace; font-size: 13px; direction: ltr; text-align: left; border: 1px solid #ddd; border-radius: 6px; height: 100px; }
                .search-box { display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap; align-items: center; }
                .search-box input { flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 5px; }
                .search-box select { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                th, td { border: 1px solid #ddd; padding: 10px; }
                th { background: #4CAF50; color: white; position: sticky; top: 0; font-weight: bold; text-align: center; }
                td { text-align: center; }
                .stats { background: #e8f5e9; padding: 8px; border-radius: 6px; margin: 10px 0; font-weight: bold; font-size: 13px; }
                .table-container { max-height: 500px; overflow-y: auto; }
                h1, h3 { font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="text-align: left; margin-bottom: 20px;">
                    <button class="btn btn-back" onclick="location.href='/hr?user=${username}&role=${role}'">← بازگشت به منابع انسانی</button>
                    <button class="btn btn-sync" onclick="syncToUsers()">🔄 همگام‌سازی با کاربران</button>
                </div>
                <h1>📋 مدیریت پرسنل</h1>
                <div class="import-box">
                    <h3 style="margin-bottom: 10px;">📎 ایمپورت از اکسل</h3>
                    ${!hasChartData ? '<div class="warning-box">⚠️ ابتدا در بخش "تعریف اطلاعات سازمان" واحد و پست تعریف کنید</div>' : ''}
                    <textarea id="pasteArea" rows="3" placeholder="مثال:&#10;علی رضایی,1001,منابع انسانی,کارشناس,1234567890&#10;سارا احمدی,1002,فنی,مدیر,0987654321" ${!hasChartData ? 'disabled' : ''}></textarea>
                    <br>
                    <button class="btn ${!hasChartData ? 'btn-disabled' : ''}" onclick="importFromClipboard()" ${!hasChartData ? 'disabled' : ''}>📥 ایمپورت اطلاعات</button>
                </div>
                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="جستجو..." onkeyup="searchTable()">
                    <select id="searchField">
                        <option value="all">همه ستون‌ها</option>
                        <option value="fullname">نام و نام خانوادگی</option>
                        <option value="personnelCode">کد پرسنلی</option>
                        <option value="unit">واحد خدمتی</option>
                        <option value="position">پست سازمانی</option>
                        <option value="nationalCode">کد ملی</option>
                    </select>
                    <button class="btn" onclick="clearSearch()">پاک کردن</button>
                </div>
                <div class="stats" id="stats"></div>
                <div class="table-container">
                    <table id="personnelTable">
                        <thead>
                            <tr>
                                <th>نام و نام خانوادگی</th>
                                <th>کد پرسنلی</th>
                                <th>واحد خدمتی</th>
                                <th>پست سازمانی</th>
                                <th>کد ملی</th>
                                <th>عملیات</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody"></tbody>
                    </table>
                </div>
            </div>
            <script>
                let allPersonnel = [];
                let currentUser = '${username}';
                let currentRole = '${role}';
                let hasChartData = ${hasChartData};
                let validUnits = ${JSON.stringify(validUnits)};
                let validPositions = ${JSON.stringify(validPositions)};
                
                async function loadPersonnel() {
                    const res = await fetch('/api/personnel');
                    allPersonnel = await res.json();
                    renderTable();
                }
                
                function renderTable() {
                    const term = document.getElementById('searchInput').value.toLowerCase();
                    const field = document.getElementById('searchField').value;
                    let filtered = allPersonnel;
                    if (term) {
                        filtered = allPersonnel.filter(p => {
                            if (field === 'all') {
                                return p.fullname.toLowerCase().includes(term) || p.personnelCode.includes(term) || p.unit.toLowerCase().includes(term) || p.position.toLowerCase().includes(term) || p.nationalCode.includes(term);
                            } else {
                                return p[field] && p[field].toString().toLowerCase().includes(term);
                            }
                        });
                    }
                    const tbody = document.getElementById('tableBody');
                    tbody.innerHTML = '';
                    if (filtered.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">هیچ داده‌ای یافت نشد</span><span class="math-inline">';
                    } else {
                        filtered.forEach(p => {
                            tbody.innerHTML += '<tr>' +
                                '<td style="text-align:center">' + p.fullname + '</td>' +
                                '<td style="text-align:center">' + p.personnelCode + '</td>' +
                                '<td style="text-align:center">' + p.unit + '</td>' +
                                '<td style="text-align:center">' + p.position + '</td>' +
                                '<td style="text-align:center">' + p.nationalCode + '</td>' +
                                '<td style="text-align:center"><button class="btn-danger" onclick="deletePersonnel(' + p.id + ')">🗑️ حذف</button></td>' +
                                '</tr>';
                        });
                    }
                    document.getElementById('stats').innerHTML = '📊 تعداد کل: ' + allPersonnel.length + ' | نمایش: ' + filtered.length;
                }
                
                function searchTable() { renderTable(); }
                function clearSearch() { document.getElementById('searchInput').value = ''; renderTable(); }
                
                async function deletePersonnel(id) {
                    if (confirm('آیا از حذف این رکورد مطمئن هستید؟')) {
                        await fetch('/api/personnel/' + id, { method: 'DELETE' });
                        await syncToUsers();
                        loadPersonnel();
                    }
                }
                
                async function syncToUsers() {
                    const res = await fetch('/api/sync-users', { method: 'POST' });
                    const result = await res.json();
                    if (result.success) {
                        console.log('همگام‌سازی انجام شد:', result.message);
                    }
                }
                
                async function importFromClipboard() {
                    if (!hasChartData) { alert('⚠️ ابتدا چارت سازمانی را تکمیل کنید!'); return; }
                    const raw = document.getElementById('pasteArea').value;
                    const rows = raw.trim().split(/\\r?\\n/);
                    let success = 0, fail = 0;
                    let errorMessages = [];
                    
                    for (let i = 0; i < rows.length; i++) {
                        const row = rows[i];
                        let cols = row.split(/\\t|,/).filter(c => c.trim() !== '');
                        
                        if (cols.length >= 5) {
                            const fullname = cols[0].trim();
                            const personnelCode = cols[1].trim();
                            const unit = cols[2].trim();
                            const position = cols[3].trim();
                            const nationalCode = cols[4].trim();
                            
                            if (!/^[0-9]{10}$/.test(nationalCode)) {
                                fail++;
                                errorMessages.push('❌ ردیف ' + (i+1) + ': کد ملی "' + nationalCode + '" باید دقیقاً 10 رقم باشد');
                                continue;
                            }
                            
                            if (!validUnits.includes(unit)) {
                                fail++;
                                errorMessages.push('❌ ردیف ' + (i+1) + ': واحد "' + unit + '" در چارت سازمانی تعریف نشده است');
                                continue;
                            }
                            if (!validPositions.includes(position)) {
                                fail++;
                                errorMessages.push('❌ ردیف ' + (i+1) + ': پست "' + position + '" در چارت سازمانی تعریف نشده است');
                                continue;
                            }
                            const exists = allPersonnel.find(p => p.personnelCode === personnelCode || p.nationalCode === nationalCode);
                            if (exists) {
                                fail++;
                                errorMessages.push('❌ ردیف ' + (i+1) + ': کد پرسنلی "' + personnelCode + '" یا کد ملی "' + nationalCode + '" تکراری است');
                                continue;
                            }
                            const res = await fetch('/api/personnel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ fullname, personnelCode, unit, position, nationalCode })
                            });
                            const result = await res.json();
                            if (result.success) {
                                success++;
                            } else {
                                fail++;
                                errorMessages.push('❌ ردیف ' + (i+1) + ': ' + (result.message || 'خطا در ثبت'));
                            }
                        } else {
                            fail++;
                            errorMessages.push('❌ ردیف ' + (i+1) + ': تعداد ستون‌ها کمتر از 5 است (' + cols.length + ' ستون)');
                        }
                    }
                    
                    let message = '✅ ایمپورت انجام شد!\\n';
                    message += 'موفق: ' + success + '\\n';
                    message += 'ناموفق: ' + fail + '\\n';
                    if (errorMessages.length > 0) {
                        message += '\\n━━━━━━━━━━━━━━━━━━━━\\n❌ دلایل خطا:\\n' + errorMessages.slice(0, 10).join('\\n');
                        if (errorMessages.length > 10) message += '\\n... و ' + (errorMessages.length-10) + ' خطای دیگر';
                    }
                    alert(message);
                    
                    await syncToUsers();
                    loadPersonnel();
                    document.getElementById('pasteArea').value = '';
                }
                
                loadPersonnel();
            </script>
        </body>
        </html>
    `);
});

// ==================== صفحات مدیریت سوالات ====================

// صفحه مدیریت سوالات عمومی
app.get('/hr/general-questions', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    if (role !== 'admin' && role !== 'management') return res.redirect('/');
    
    let rows = '';
    for (let i = 0; i < generalQuestions.length; i++) {
        const q = generalQuestions[i];
        rows += '<tr><td style="text-align:center;">' + (i+1) + '</td><td style="text-align:right;">' + q.question + '</td><td style="text-align:center;"><button class="btn btn-edit" onclick="editQuestion(' + q.id + ', \'' + q.question.replace(/'/g, "\\'") + '\')">✏️ ویرایش</button> <button class="btn btn-delete" onclick="deleteQuestion(' + q.id + ')">🗑️ حذف</button> </span><span class="math-inline">';
    }
    if (generalQuestions.length === 0) {
        rows = '<tr><td colspan="3" style="text-align:center;">هیچ سوالی ثبت نشده است</span><span class="math-inline">';
    }
    
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>مدیریت سوالات آزمون عمومی</title><style>' +
        'body { font-family: "Vazirmatn", "Segoe UI", "IRANSans", Tahoma, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }' +
        '.container { max-width: 1000px; margin: 0 auto; background: white; padding: 25px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }' +
        '.btn { background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin: 5px; }' +
        '.btn-edit { background: #2196F3; } .btn-delete { background: #ff4444; } .btn-add { background: #4CAF50; font-size: 16px; } .btn-back { background: #666; }' +
        'table { width: 100%; border-collapse: collapse; margin-top: 20px; } th, td { border: 1px solid #ddd; padding: 12px; } th { background: #4CAF50; color: white; text-align: center; }' +
        '.stats { background: #e8f5e9; padding: 10px; border-radius: 6px; margin: 15px 0; font-weight: bold; }' +
        '.modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; z-index: 1000; }' +
        '.modal-content { background: white; padding: 25px; border-radius: 15px; width: 500px; max-width: 90%; }' +
        '.modal-content textarea { width: 100%; padding: 8px; margin: 8px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; height: 120px; resize: vertical; font-family: inherit; }' +
        '</style></head><body>' +
        '<div class="container">' +
        '<button class="btn btn-back" onclick="location.href=\'/hr?user=' + username + '&role=' + role + '\'">← بازگشت به منابع انسانی</button>' +
        '<h1>📝 مدیریت سوالات آزمون عمومی</h1>' +
        '<div class="stats">📊 تعداد کل سوالات: ' + generalQuestions.length + ' از 15 سوال</div>' +
        '<button class="btn btn-add" onclick="showAddModal()">➕ افزودن سوال جدید</button>' +
        '<table><thead><tr><th>ردیف</th><th>متن سوال</th><th>عملیات</th><tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>' +
        '<div id="questionModal" class="modal"><div class="modal-content"><h2 id="modalTitle">افزودن سوال جدید</h2>' +
        '<form id="questionForm"><input type="hidden" id="questionId">' +
        '<textarea id="questionText" placeholder="متن سوال..." required></textarea>' +
        '<div style="margin-top:20px; text-align:left;"><button type="submit" class="btn">💾 ذخیره</button>' +
        '<button type="button" class="btn btn-back" onclick="closeModal()">❌ انصراف</button></div></form></div></div>' +
        '<script>' +
        'function showAddModal() { document.getElementById("modalTitle").innerHTML = "افزودن سوال جدید"; document.getElementById("questionForm").reset(); document.getElementById("questionId").value = ""; document.getElementById("questionModal").style.display = "flex"; }' +
        'function closeModal() { document.getElementById("questionModal").style.display = "none"; }' +
        'function editQuestion(id, text) { document.getElementById("modalTitle").innerHTML = "ویرایش سوال"; document.getElementById("questionId").value = id; document.getElementById("questionText").value = text; document.getElementById("questionModal").style.display = "flex"; }' +
        'async function deleteQuestion(id) { if(confirm("آیا از حذف این سوال مطمئن هستید؟")) { const res = await fetch("/api/general-question/" + id, { method: "DELETE" }); const result = await res.json(); if(result.success) { alert("سوال حذف شد"); location.reload(); } else alert("خطا در حذف"); } }' +
        'document.getElementById("questionForm").addEventListener("submit", async (e) => { e.preventDefault(); const id = document.getElementById("questionId").value; const question = document.getElementById("questionText").value; const url = id ? "/api/general-question/" + id : "/api/general-question"; const method = id ? "PUT" : "POST"; const res = await fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: question }) }); const result = await res.json(); if(result.success) { alert(id ? "ویرایش شد" : "اضافه شد"); location.reload(); } else alert(result.message || "خطا"); });' +
        'window.onclick = function(event) { if(event.target === document.getElementById("questionModal")) closeModal(); }' +
        '</script></body></html>';
    
    res.send(html);
});

// صفحه مدیریت سوالات تخصصی
app.get('/hr/specialized-questions', (req, res) => {
    const username = req.query.user;
    const role = req.query.role;
    if (role !== 'admin' && role !== 'management') return res.redirect('/');
    
    let rows = '';
    for (let i = 0; i < specializedQuestions.length; i++) {
        const q = specializedQuestions[i];
        rows += '<tr>';
        rows += '<td style="text-align:center;">' + (i+1) + '</td>';
        rows += '<td style="text-align:right;">' + q.question + '</td>';
        rows += '<td style="text-align:center;">' + q.option1 + '</td>';
        rows += '<td style="text-align:center;">' + q.option2 + '</td>';
        rows += '<td style="text-align:center;">' + q.option3 + '</td>';
        rows += '<td style="text-align:center;">' + q.option4 + '</td>';
        rows += '<td style="text-align:center; color:#4CAF50; font-weight:bold;">گزینه ' + q.correct + '</td>';
        rows += '<td style="text-align:center;"><button class="btn btn-edit" onclick="editQuestion(' + q.id + ')">✏️ ویرایش</button> <button class="btn btn-delete" onclick="deleteQuestion(' + q.id + ')">🗑️ حذف</button> </span><span class="math-inline">';
        rows += '</tr>';
    }
    if (specializedQuestions.length === 0) {
        rows = '<tr><td colspan="8" style="text-align:center;">هیچ سوالی ثبت نشده است</span><span class="math-inline">';
    }
    
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>مدیریت سوالات آزمون تخصصی</title><style>' +
        'body { font-family: "Vazirmatn", "Segoe UI", "IRANSans", Tahoma, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }' +
        '.container { max-width: 1200px; margin: 0 auto; background: white; padding: 25px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }' +
        '.btn { background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin: 5px; }' +
        '.btn-edit { background: #2196F3; } .btn-delete { background: #ff4444; } .btn-add { background: #4CAF50; font-size: 16px; } .btn-back { background: #666; }' +
        'table { width: 100%; border-collapse: collapse; margin-top: 20px; } th, td { border: 1px solid #ddd; padding: 12px; } th { background: #4CAF50; color: white; text-align: center; }' +
        '.stats { background: #e8f5e9; padding: 10px; border-radius: 6px; margin: 15px 0; font-weight: bold; }' +
        '.modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; z-index: 1000; }' +
        '.modal-content { background: white; padding: 25px; border-radius: 15px; width: 500px; max-width: 90%; }' +
        '.modal-content input, .modal-content textarea, .modal-content select { width: 100%; padding: 8px; margin: 8px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }' +
        '.modal-content textarea { height: 80px; resize: vertical; }' +
        '.option-group { display: flex; gap: 10px; margin: 10px 0; } .option-group input { flex: 1; }' +
        '.correct-option { background: #e8f5e9; padding: 10px; border-radius: 8px; margin: 10px 0; }' +
        '</style></head><body>' +
        '<div class="container">' +
        '<button class="btn btn-back" onclick="location.href=\'/hr?user=' + username + '&role=' + role + '\'">← بازگشت به منابع انسانی</button>' +
        '<h1>🎯 مدیریت سوالات آزمون تخصصی</h1>' +
        '<div class="stats">📊 تعداد کل سوالات: ' + specializedQuestions.length + ' از 10 سوال</div>' +
        '<button class="btn btn-add" onclick="showAddModal()">➕ افزودن سوال جدید</button>' +
        '<table id="questionsTable"><thead><tr><th>ردیف</th><th>سوال</th><th>گزینه 1</th><th>گزینه 2</th><th>گزینه 3</th><th>گزینه 4</th><th>پاسخ صحیح</th><th>عملیات</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>' +
        '<div id="questionModal" class="modal"><div class="modal-content"><h2 id="modalTitle">افزودن سوال جدید</h2>' +
        '<form id="questionForm"><input type="hidden" id="questionId">' +
        '<textarea id="questionText" placeholder="متن سوال..." required></textarea>' +
        '<div class="option-group"><input type="text" id="option1" placeholder="گزینه 1" required><input type="text" id="option2" placeholder="گزینه 2" required></div>' +
        '<div class="option-group"><input type="text" id="option3" placeholder="گزینه 3" required><input type="text" id="option4" placeholder="گزینه 4" required></div>' +
        '<div class="correct-option"><label>پاسخ صحیح:</label><select id="correctOption">' +
        '<option value="1">گزینه 1</option><option value="2">گزینه 2</option><option value="3">گزینه 3</option><option value="4">گزینه 4</option></select></div>' +
        '<div style="margin-top:20px; text-align:left;"><button type="submit" class="btn">💾 ذخیره</button>' +
        '<button type="button" class="btn btn-back" onclick="closeModal()">❌ انصراف</button></div></form></div></div>' +
        '<script>' +
        'let currentQuestions = ' + JSON.stringify(specializedQuestions) + ';' +
        'function showAddModal() { document.getElementById("modalTitle").innerHTML = "افزودن سوال جدید"; document.getElementById("questionForm").reset(); document.getElementById("questionId").value = ""; document.getElementById("questionModal").style.display = "flex"; }' +
        'function closeModal() { document.getElementById("questionModal").style.display = "none"; }' +
        'function editQuestion(id) { const q = currentQuestions.find(q => q.id === id); if(q) { document.getElementById("modalTitle").innerHTML = "ویرایش سوال"; document.getElementById("questionId").value = q.id; document.getElementById("questionText").value = q.question; document.getElementById("option1").value = q.option1; document.getElementById("option2").value = q.option2; document.getElementById("option3").value = q.option3; document.getElementById("option4").value = q.option4; document.getElementById("correctOption").value = q.correct; document.getElementById("questionModal").style.display = "flex"; } }' +
        'async function deleteQuestion(id) { if(confirm("آیا از حذف این سوال مطمئن هستید؟")) { const res = await fetch("/api/specialized-question/" + id, { method: "DELETE" }); const result = await res.json(); if(result.success) { alert("سوال حذف شد"); location.reload(); } else alert("خطا در حذف"); } }' +
        'document.getElementById("questionForm").addEventListener("submit", async (e) => { e.preventDefault(); const id = document.getElementById("questionId").value; const data = { question: document.getElementById("questionText").value, option1: document.getElementById("option1").value, option2: document.getElementById("option2").value, option3: document.getElementById("option3").value, option4: document.getElementById("option4").value, correct: document.getElementById("correctOption").value }; const url = id ? "/api/specialized-question/" + id : "/api/specialized-question"; const method = id ? "PUT" : "POST"; const res = await fetch(url, { method: method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await res.json(); if(result.success) { alert(id ? "ویرایش شد" : "اضافه شد"); location.reload(); } else alert(result.message || "خطا"); });' +
        'window.onclick = function(event) { if(event.target === document.getElementById("questionModal")) closeModal(); }' +
        '</script></body></html>';
    
    res.send(html);
});

// ==================== API ها ====================
app.get('/api/personnel', (req, res) => res.json(personnel));

app.post('/api/personnel', (req, res) => {
    const { fullname, personnelCode, unit, position, nationalCode } = req.body;
    if (fullname && personnelCode && unit && position && nationalCode) {
        if (!/^[0-9]{10}$/.test(nationalCode)) {
            return res.json({ success: false, message: 'کد ملی باید دقیقاً 10 رقم باشد' });
        }
        const exists = personnel.find(p => p.personnelCode === personnelCode || p.nationalCode === nationalCode);
        if (!exists) {
            personnel.push({ id: nextPersonnelId++, fullname, personnelCode, unit, position, nationalCode });
            syncUsersFromPersonnel();
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'کد پرسنلی یا کد ملی تکراری است' });
        }
    } else {
        res.json({ success: false, message: 'اطلاعات ناقص است' });
    }
});

app.delete('/api/personnel/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const deletedPersonnel = personnel.find(p => p.id === id);
    personnel = personnel.filter(p => p.id !== id);
    
    if (deletedPersonnel && systemUsers[deletedPersonnel.nationalCode]) {
        delete systemUsers[deletedPersonnel.nationalCode];
    }
    
    res.json({ success: true });
});

app.post('/api/sync-users', (req, res) => {
    syncUsersFromPersonnel();
    res.json({ success: true, message: Object.keys(systemUsers).length + ' کاربر همگام‌سازی شدند' });
});

// API سوالات عمومی
app.get('/api/general-questions', (req, res) => res.json(generalQuestions));
app.post('/api/general-question', (req, res) => {
    const { question } = req.body;
    if (generalQuestions.length >= 15) return res.json({ success: false, message: 'تعداد سوالات نمی‌تواند بیشتر از 15 باشد' });
    if (question) {
        generalQuestions.push({ id: nextGeneralId++, question });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'متن سوال وارد نشده است' });
    }
});
app.put('/api/general-question/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { question } = req.body;
    const index = generalQuestions.findIndex(q => q.id === id);
    if (index !== -1) {
        generalQuestions[index].question = question;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});
app.delete('/api/general-question/:id', (req, res) => {
    generalQuestions = generalQuestions.filter(q => q.id != req.params.id);
    res.json({ success: true });
});

// API سوالات تخصصی
app.get('/api/specialized-questions', (req, res) => res.json(specializedQuestions));
app.post('/api/specialized-question', (req, res) => {
    const { question, option1, option2, option3, option4, correct } = req.body;
    if (specializedQuestions.length >= 10) return res.json({ success: false, message: 'تعداد سوالات نمی‌تواند بیشتر از 10 باشد' });
    if (question && option1 && option2 && option3 && option4 && correct) {
        specializedQuestions.push({ id: nextSpecializedId++, question, option1, option2, option3, option4, correct: parseInt(correct) });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'اطلاعات ناقص است' });
    }
});
app.put('/api/specialized-question/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { question, option1, option2, option3, option4, correct } = req.body;
    const index = specializedQuestions.findIndex(q => q.id === id);
    if (index !== -1) {
        specializedQuestions[index] = { ...specializedQuestions[index], question, option1, option2, option3, option4, correct: parseInt(correct) };
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});
app.delete('/api/specialized-question/:id', (req, res) => {
    specializedQuestions = specializedQuestions.filter(q => q.id != req.params.id);
    res.json({ success: true });
});

// ==================== پردازش فرم‌ها ====================
app.post('/hr/add-unit', (req, res) => {
    const { unitName, username } = req.body;
    if (unitName && !organizationalUnits.find(u => u.name === unitName)) {
        organizationalUnits.push({ id: nextUnitId++, name: unitName });
    }
    res.redirect("/hr/organization?user=" + username + "&role=admin");
});

app.post('/hr/add-position', (req, res) => {
    const { positionName, username } = req.body;
    if (positionName && !organizationalPositions.find(p => p.name === positionName)) {
        organizationalPositions.push({ id: nextPositionId++, name: positionName });
    }
    res.redirect("/hr/organization?user=" + username + "&role=admin");
});

app.get('/hr/delete-unit', (req, res) => {
    const { id, username, role } = req.query;
    organizationalUnits = organizationalUnits.filter(u => u.id != id);
    res.redirect("/hr/organization?user=" + username + "&role=" + role);
});

app.get('/hr/delete-position', (req, res) => {
    const { id, username, role } = req.query;
    organizationalPositions = organizationalPositions.filter(p => p.id != id);
    res.redirect("/hr/organization?user=" + username + "&role=" + role);
});

app.post('/hr/add-personnel', (req, res) => {
    const { fullname, personnelCode, unit, position, nationalCode, username } = req.body;
    if (fullname && personnelCode && unit && position && nationalCode && /^[0-9]{10}$/.test(nationalCode)) {
        const exists = personnel.find(p => p.personnelCode === personnelCode || p.nationalCode === nationalCode);
        if (!exists) {
            personnel.push({ id: nextPersonnelId++, fullname, personnelCode, unit, position, nationalCode });
            syncUsersFromPersonnel();
        }
    }
    res.redirect("/hr/personnel/list?user=" + username + "&role=admin");
});

// ==================== راه‌اندازی ====================
const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ سرور اجرا شد: http://localhost:${port}`);
    console.log('👤 ادمین: admin | 🔑 123456');
    console.log('═══════════════════════════════════════');
});
