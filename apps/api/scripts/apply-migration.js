import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = '';

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inDollarQuote && trimmed.startsWith('--')) {
      continue;
    }

    const matches = line.match(/\$\$|\$[a-zA-Z0-9_]+\$/g);
    if (matches) {
      for (const m of matches) {
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = m;
        } else if (dollarTag === m) {
          inDollarQuote = false;
          dollarTag = '';
        }
      }
    }

    current += line + '\n';

    if (!inDollarQuote && trimmed.endsWith(';')) {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function run() {
  try {
    const sql = fs.readFileSync('prisma/migrations_manual/01_postgis_triggers_rpc.sql', 'utf8');
    const statements = splitSqlStatements(sql);
    console.log(`Found ${statements.length} SQL statements to execute.`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (stmtErr) {
        console.error(`Error at statement ${i + 1}:`, stmtErr.message);
        console.error('SQL snippet:', stmt.slice(0, 100));
        throw stmtErr;
      }
    }

    console.log('✅ Successfully applied all 11 functions, 6 triggers, and cleaned legacy functions!');
  } catch (err) {
    console.error('❌ Failed to execute migration SQL:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
