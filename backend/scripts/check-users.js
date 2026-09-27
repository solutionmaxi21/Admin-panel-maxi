import db from '../src/db/postgres.js';

async function checkUsers() {
  try {
    console.log('Checking users in database...\n');
    
    const users = await db.queryMany('SELECT id, username, email, full_name, first_name, last_name, role, is_active, email_verified FROM users LIMIT 5');
    
    console.log(`Found ${users.length} users:`);
    console.log(JSON.stringify(users, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
