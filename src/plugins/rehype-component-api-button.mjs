/// <reference types="mdast" />
import { h } from "hastscript";

const uid = () => Math.random().toString(36).slice(-6);

export function ApiButtonComponent(properties, children) {
	if (Array.isArray(children) && children.length !== 0)
		return h("div", { class: "hidden" }, [
			'Invalid directive. ("api" directive must be leaf type ::api{url="..."})',
		]);

	const apiUrl = properties.url || "";
	const label = properties.label || "发送请求";
	if (!apiUrl)
		return h(
			"div",
			{ class: "hidden" },
			'Missing URL. ("url" attribute is required)',
		);

	const id = `API${uid()}`;
	const yid = `${id}-y`;
	const zid = `${id}-z`;
	const pid = `${id}-p`;
	const rid = `${id}-r`;
	const fid = `${id}-f`;

	const container = h(
		`div#${id}`,
		{ class: "flex items-center gap-3 flex-wrap" },
		[
			h(
				`button#${id}-btn`,
				{
					class:
						"inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-(--primary) text-white dark:text-black/70 font-medium hover:bg-(--primary)/80 hover:scale-105 active:scale-95 transition-all cursor-pointer border-none text-sm shrink-0",
				},
				label,
			),
		],
	);

	const s =
		`(function(){var b=document.getElementById('${id}-btn'),c=document.getElementById('${id}'),u=${JSON.stringify(apiUrl)};` +
		`b.addEventListener('click',function(){b.disabled=true;b.textContent='获取中...';` +
		`fetch(u,{headers:{'Accept':'application/json'}}).then(async function(k){` +
		`var l=await k.text(),m;try{m=JSON.parse(l)}catch(e){}` +
		`var n=m&&(m.url||m.data&&m.data.url);` +
		`if(n){var fn=m.filename||'download';` +
		`c.innerHTML='<div class="w-full rounded-xl bg-(--card-bg) border border-(--line-divider) p-4 flex flex-col gap-3">` +
		`<div class="flex items-center gap-2"><span class="text-sm font-semibold truncate min-w-0 flex-1">'+fn+'</span></div>` +
		`<div class="flex items-center gap-2 flex-wrap">` +
		`<button id="${yid}" class="shrink-0 no-styling inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-(--primary) text-white dark:text-black/70 font-semibold text-sm hover:bg-(--primary)/90 hover:scale-105 active:scale-95 transition-all cursor-pointer border-none">下载1</button>` +
		`<a id="${zid}" href="'+n+'" target="_blank" rel="noopener" class="shrink-0 no-styling text-xs text-(--primary) underline decoration-dashed underline-offset-2 hover:text-(--primary)/80 transition-all">下载2</a></div>` +
		`<div class="flex items-center justify-between text-xs text-neutral-500">` +
		`<span id="${pid}"></span>` +
		`<span id="${rid}"></span></div>` +
		`<div class="w-full h-2 rounded-full bg-(--primary)/10 overflow-hidden"><div id="${fid}" class="h-full rounded-full bg-(--primary) transition-all duration-200" style="width:0%"></div></div></div>';` +
		`document.getElementById('${yid}').addEventListener('click',async function(){` +
		`var Y=document.getElementById('${yid}'),P=document.getElementById('${pid}'),R=document.getElementById('${rid}'),F=document.getElementById('${fid}');` +
		`if(Y._d)return;Y._d=true;Y.disabled=true;Y.textContent='准备中...';` +
		`try{var h=await window.showSaveFilePicker({suggestedName:fn});` +
		`if(h){P.textContent='正在下载...';fetch(n).then(async function(r){` +
		`var cl=parseInt(r.headers.get('Content-Length'))||0,re=r.body.getReader(),ws=await h.createWritable();` +
		`function fmt(nn){var u=['B','KB','MB','GB'],i=0;while(nn>=1024&&i<3){nn/=1024;i++}return nn.toFixed(i>0?1:0)+u[i]}` +
		`var received=0,_st=Date.now();while(true){var d=await re.read();if(d.done)break;await ws.write(d.value);received+=d.value.length;` +
		`if(cl){var pct=Math.round(received/cl*100),_el=(Date.now()-_st)/1000,_sp=_el>0?received/_el:0;F.style.width=pct+'%';P.textContent=fmt(received)+'/'+fmt(cl)+'  '+fmt(_sp)+'/s';R.textContent=pct+'%'}}` +
		`await ws.close();F.style.width='100%';P.textContent='下载完成';R.textContent='100%'})}}catch(e1){P.textContent='';R.textContent=''}` +
		`Y.textContent='下载1';Y.disabled=false;Y._d=false})` +
		`}else{try{c.innerHTML='<pre class="overflow-auto p-3 text-sm font-mono whitespace-pre-wrap break-all m-0 rounded-xl bg-(--card-bg) border border-(--line-divider) max-h-60">'+JSON.stringify(JSON.parse(l),null,2)+'</pre>'}catch(e){c.textContent=l}}` +
		`}).catch(function(){c.innerHTML='<span class="text-sm text-red-500">请求失败</span>'})` +
		`.finally(function(){b.disabled=false;b.textContent='${label}'})})})();`;

	const script = h(`script#${id}-script`, { type: "text/javascript" }, s);

	return h("div", { class: "my-4" }, [container, script]);
}
