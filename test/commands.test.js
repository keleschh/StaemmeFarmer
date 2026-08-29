import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, fixture, tick } from './setup.js';

const plain = (x) => JSON.parse(JSON.stringify(x));
const arrival = Math.round(new Date(2026, 7, 29, 17, 22, 56, 152).getTime() / 1000);

// Laufende Angriffe kommen aus der Befehlsübersicht (serverseitig, also auch
// von anderen Geräten oder von Hand geschickt). Die Einheitenspalten dort
// liefern die Tragekapazität exakt; das localStorage-Gedächtnis ist nur Fallback.
describe('Kapazität laufender Angriffe aus der Befehlsübersicht', () => {
  test('2 LKav = 160 Kapazität je Befehl, Ankunft wie bisher', async () => {
    const env = createEnv({ premium: false });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.deepEqual(plain(data.commands['589|423']), [{ ts: arrival, cap: 160 }]);
    assert.equal(data.commands['588|427'][0].cap, 160);
    assert.equal(data.commands['590|421'][0].cap, 160);
  });

  test('ohne Einheitenspalten: nur die Ankunftszeit (altes Verhalten)', async () => {
    const commandsHtml = fixture('overview_commands.html').replace(/<td class="unit-item[^"]*">\d+<\/td>/g, '');
    const env = createEnv({ premium: false, commandsHtml });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.deepEqual(plain(data.commands['589|423']), [arrival]);
  });

  test('Planung: fremder 10-LKav-Angriff auf gespähtes Dorf nimmt 800, nicht 160', async () => {
    // 593|423 ist gespäht; ein laufender Angriff mit 10 LKav ohne sent-Eintrag
    const commandsHtml = fixture('overview_commands.html')
      .replace('(589|423)', '(593|423)')
      .replace('<td class="unit-item">2</td>', '<td class="unit-item">10</td>');
    const env = createEnv({ premium: false, commandsHtml });
    await tick();
    const data = await env.internals.getData(0, false, false, true, 0);
    assert.equal(data.commands['593|423'][0].cap, 800);
    assert.equal(data.commands['589|423'], undefined);
  });
});
