const { execSync } = require('child_process');

const envVars = {
    DATABASE_URL: 'postgresql://juratbek:Messi0105@postgresql-juratbek.alwaysdata.net:5432/juratbek_odoo_db',
    JWT_SECRET: 'super_strong_secret_key_2026',
    TELEGRAM_BOT_TOKEN: '8280763848:AAFpUCja2kF0dyatui49TmYGYYTGuPKJr7c',
    TELEGRAM_GROUP_ID: '-1003714441392'
};

const fs = require('fs');
fs.writeFileSync('d:\\campuseats-backend\\tmp_env.txt', '', { encoding: 'utf8' });

for (const [key, value] of Object.entries(envVars)) {
    fs.writeFileSync('d:\\campuseats-backend\\tmp_env.txt', value, { encoding: 'utf8' });
    try {
        execSync(`Get-Content tmp_env.txt -Raw | npx vercel env add ${key} preview`, { cwd: 'd:\\campuseats-backend', shell: 'powershell.exe' });
        console.log(`✅ Added ${key} to preview`);
    } catch (e) { }
    try {
        execSync(`Get-Content tmp_env.txt -Raw | npx vercel env add ${key} development`, { cwd: 'd:\\campuseats-backend', shell: 'powershell.exe' });
        console.log(`✅ Added ${key} to dev`);
    } catch (e) { }
}

const triggerCode = `try {
    require('child_process').execSync('git commit --allow-empty -m "trigger-preview" && git push origin master && git push origin main', {stdio:'inherit'});
} catch(e) {}`;
fs.writeFileSync('d:\\campuseats-backend\\trigger.js', triggerCode);
require('./trigger.js');
