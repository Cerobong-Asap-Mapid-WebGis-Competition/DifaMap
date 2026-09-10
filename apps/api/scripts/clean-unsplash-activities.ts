import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const acts = await prisma.activity.findMany();
  console.log(`Checking ${acts.length} activities for unsplash URLs...`);

  let replacedCount = 0;
  for (const act of acts) {
    const urls = act.mediaUrls || [];
    const hasUnsplash = urls.some((u) => u.includes('unsplash.com'));
    if (hasUnsplash) {
      // Tentukan foto lokal yang paling cocok berdasarkan judul/deskripsi
      let replacement = '/photos/default-accessibility.jpg';
      const text = `${act.title} ${act.description || ''}`.toLowerCase();
      if (text.includes('perintis') || text.includes('unhas') || text.includes('tamalanrea')) {
        replacement = '/photos/perintis.jpg';
      } else if (text.includes('nipah') || text.includes('urip') || text.includes('panakkukang')) {
        replacement = '/photos/nipah.jpg';
      } else if (text.includes('losari') || text.includes('penghibur') || text.includes('cpi') || text.includes('pantai')) {
        replacement = '/photos/losari.jpg';
      } else if (text.includes('danau')) {
        replacement = '/photos/danau-unhas.jpg';
      } else if (text.includes('gowa') || text.includes('syekh yusuf') || text.includes('malino')) {
        replacement = '/photos/gowa.jpg';
      } else if (text.includes('mari') || text.includes('ratulangi')) {
        replacement = '/photos/mari.jpg';
      } else if (text.includes('pettarani')) {
        replacement = '/photos/pettarani.jpg';
      } else if (text.includes('karebosi') || text.includes('balai kota')) {
        replacement = '/photos/karebosi.jpg';
      }

      const newUrls = urls.map((u) => (u.includes('unsplash.com') ? replacement : u));
      await prisma.activity.update({
        where: { id: act.id },
        data: { mediaUrls: newUrls },
      });
      console.log(`Fixed "${act.title}" -> ${replacement}`);
      replacedCount++;
    }
  }

  console.log(`Total replaced: ${replacedCount}`);
}

main().finally(() => prisma.$disconnect());
