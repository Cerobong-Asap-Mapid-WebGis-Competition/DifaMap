import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const locs = await prisma.location.findMany();
  console.log(`Checking ${locs.length} locations...`);

  const failedLocs = [];
  for (const loc of locs) {
    if (!loc.coverImageUrl) {
      console.log(`[EMPTY] ${loc.name}`);
      continue;
    }
    const targetUrl = loc.coverImageUrl.startsWith('/')
      ? `http://localhost:3000${loc.coverImageUrl}`
      : loc.coverImageUrl;
    try {
      const res = await axios.head(targetUrl, { timeout: 4000 });
      if (res.status === 200) {
        console.log(`[OK 200] ${loc.name}`);
      } else {
        console.log(`[FAIL ${res.status}] ${loc.name} -> ${loc.coverImageUrl}`);
        failedLocs.push(loc);
      }
    } catch (err) {
      console.log(`[FAIL ${err.response?.status || err.message}] ${loc.name} -> ${loc.coverImageUrl}`);
      failedLocs.push(loc);
    }
  }

  console.log(`\nFailed count: ${failedLocs.length} of ${locs.length}`);

  // Also check activity mediaUrls
  const acts = await prisma.activity.findMany();
  console.log(`\nChecking ${acts.length} activities...`);
  let failedActs = 0;
  for (const act of acts) {
    const urls = act.mediaUrls || [];
    for (const u of urls) {
      const targetUrl = u.startsWith('/') ? `http://localhost:3000${u}` : u;
      try {
        const res = await axios.head(targetUrl, { timeout: 3000 });
        if (res.status !== 200) {
          console.log(`[ACT FAIL ${res.status}] ${act.title} -> ${u}`);
          failedActs++;
          break;
        }
      } catch (err) {
        console.log(`[ACT FAIL ${err.response?.status || err.message}] ${act.title} -> ${u}`);
        failedActs++;
        break;
      }
    }
  }
  console.log(`Failed activities: ${failedActs} of ${acts.length}`);
}

main().finally(() => prisma.$disconnect());
