import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export async function playerFixture() {
  const counts: Record<string, number> = {};
  const html = (origin: string) => `<!doctype html><html><head><style>
    #player{position:relative;width:640px;height:360px}video{width:640px;height:360px;background:#123}
    .sponsor-layer{position:absolute;top:20px;left:20px;width:200px;height:70px;background:orange}
    .vjs-control-bar{position:absolute;bottom:0;left:0;width:640px;height:40px}
    </style></head><body><div id="player" class="video-js"><video muted playsinline></video>
    <div class="sponsor-layer" title="Advertisement: sponsored promotion"><a href="https://promotion.example/" target="_blank">Sponsor</a></div>
    <div class="vjs-control-bar"><button id="play">Play</button><button id="realm">Realm</button><button id="share-button" aria-label="Share video">Share</button><button id="navigate">Navigate</button><a id="share-link" href="${origin}/intended" target="_blank">Open video details</a></div></div>
    <button id="outside">Other action</button><button id="synthetic">Synthetic link test</button>
    <script src="${origin}/standalone-unit.js" title="Advertising-only popunder loader" class="advertisement"></script>
    <script src="${origin}/shared-player.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://fixture').pathname;
    counts[path] = (counts[path] ?? 0) + 1;
    res.setHeader('Cache-Control', 'no-store');
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (path.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    else res.setHeader('Content-Type', 'text/html');
    if (path === '/standalone-unit.js') res.end(`
      window.standaloneLoaded=true;fetch('${origin}/unit-child');
      document.addEventListener('click',e=>{if(e.target.id!=='play')return;window.standaloneCalls=(window.standaloneCalls||0)+1;
      const popup=window.open('about:blank','', 'width=1,height=1');if(popup){popup.resizeTo(900,700);popup.location.href='${origin}/promotion';}},true);`);
    else if (path === '/shared-player.js') res.end(`
      window.playerLoaded=true;
      const video=document.querySelector('video'), canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
      const draw=()=>{const c=canvas.getContext('2d');c.fillStyle='hsl('+Date.now()%360+',50%,50%)';c.fillRect(0,0,320,180);};draw();setInterval(draw,100);
      video.srcObject=canvas.captureStream(10);
      function sideEffect(){window.open('${origin}/promotion','_blank');window.afterPopup=true;}
      window.addClickShield=()=>{window.shield?.remove();const cover=document.createElement('div');cover.style='position:absolute;inset:0;z-index:100000';cover.onclick=sideEffect;document.querySelector('#player').append(cover);window.shield=cover;};
      document.querySelector('#play').addEventListener('click',()=>{sideEffect();video.play();});
      document.querySelector('#outside').onclick=sideEffect;
      document.querySelector('#realm').onclick=()=>{const iframe=document.createElement('iframe');iframe.style.display='none';document.body.append(iframe);const popup=iframe.contentWindow.open('about:blank','','width=1,height=1');if(popup)popup.location.href='${origin}/promotion';iframe.remove();window.realmDone=true;};
      document.querySelector('#share-button').onclick=()=>window.open('${origin}/intended','_blank');
      document.querySelector('#navigate').onclick=()=>window.open('#details','_self');
      document.querySelector('#synthetic').onclick=()=>{const a=document.createElement('a');a.href='${origin}/promotion';a.target='_blank';a.click();};
      document.querySelector('#share-link').onclick=e=>{e.preventDefault();window.open(e.currentTarget.href,'_blank');};
    `);
    else if (path === '/nested-player') res.end(`<iframe id="nested" width="680" height="500" src="${origin}/player"></iframe>`);
    else if (path === '/blank-player') res.end(`<iframe id="nested" width="680" height="500" srcdoc="${html(origin).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>`);
    else if (path === '/player') res.end(html(origin));
    else res.end('<!doctype html><title>Destination</title>Destination');
  });
  await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve));
  return { url: `http://localhost:${(server.address() as AddressInfo).port}`, counts,
    reset() { for (const key of Object.keys(counts)) delete counts[key]; },
    close() { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
