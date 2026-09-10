import axios from 'axios';

(async () => {
  const res = await axios.post('https://server.mapid.io/web/competition/activities', {
    feature: {
      type: 'Polygon',
      coordinates: [
        [
          [119.35, -5.25],
          [119.55, -5.25],
          [119.55, -5.05],
          [119.35, -5.05],
          [119.35, -5.25]
        ]
      ]
    },
    start_date: '2026-08-01',
    end_date: '2026-09-30'
  }, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': '6a8a7eedffc137c94307a71c'
    }
  });

  const activities = res.data?.data?.activities || [];
  console.log('Total activities:', activities.length);
  for (let i = 0; i < Math.min(10, activities.length); i++) {
    const a = activities[i];
    console.log(`\n=== [${i}] ${a.title} by ${a.user_name} ===`);
    console.log('Medias count:', a.medias?.length);
    a.medias?.forEach((m, idx) => {
      console.log(`  [${idx}] ${m}`);
    });
  }
})();
