import{R as r,j as e}from"./index-DD4y5ToL.js";import{N as p}from"./NumberFlow-client-BGPmzcXX-CqxGsmbg.js";import{c as a}from"./createLucideIcon-Ctw179Cz.js";/**
 * @license lucide-react v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b=[["path",{d:"M5 12h14",key:"1ays0h"}]],m=a("minus",b);/**
 * @license lucide-react v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["rect",{x:"14",y:"3",width:"5",height:"18",rx:"1",key:"kaeet6"}],["rect",{x:"5",y:"3",width:"5",height:"18",rx:"1",key:"1wsw3u"}]],y=a("pause",f);/**
 * @license lucide-react v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]],g=a("play",N);/**
 * @license lucide-react v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]],x=a("plus",w);/**
 * @license lucide-react v0.561.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],k=a("rotate-ccw",j),i=[92,93,99,100,8,0,42,78,122,5,87,90],n="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",v=t=>Math.max(-999,Math.min(9999,t)),C=()=>{const[t,d]=r.useState(92),[c,u]=r.useState(!0),l=r.useRef(0);r.useEffect(()=>{if(!c)return;const s=window.setInterval(()=>{l.current=(l.current+1)%i.length,d(i[l.current])},3e3);return()=>window.clearInterval(s)},[c]);const o=s=>{u(!1),d(v(s))},h=()=>{l.current=0,d(i[0])};return e.jsx("main",{className:"min-h-[420px] bg-background p-6 text-foreground",children:e.jsxs("section",{className:"mx-auto flex max-w-2xl flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-sm",children:[e.jsxs("div",{className:"flex flex-col gap-2",children:[e.jsx("p",{className:"text-xs font-medium uppercase tracking-wide text-muted-foreground",children:"NumberFlow"}),e.jsxs("div",{className:"flex items-end justify-between gap-4",children:[e.jsx("div",{className:"text-7xl font-semibold leading-none tabular-nums",children:e.jsx(p,{value:t,isolate:!0})}),e.jsxs("button",{type:"button",className:n,onClick:()=>u(s=>!s),children:[c?e.jsx(y,{className:"h-4 w-4"}):e.jsx(g,{className:"h-4 w-4"}),c?"Pause":"Play"]})]})]}),e.jsxs("div",{className:"flex flex-wrap items-center gap-2",children:[e.jsxs("button",{type:"button",className:n,onClick:()=>o(t-10),children:[e.jsx(m,{className:"h-4 w-4"}),"10"]}),e.jsxs("button",{type:"button",className:n,onClick:()=>o(t-1),children:[e.jsx(m,{className:"h-4 w-4"}),"1"]}),e.jsxs("button",{type:"button",className:n,onClick:()=>o(t+1),children:[e.jsx(x,{className:"h-4 w-4"}),"1"]}),e.jsxs("button",{type:"button",className:n,onClick:()=>o(t+10),children:[e.jsx(x,{className:"h-4 w-4"}),"10"]}),e.jsxs("button",{type:"button",className:n,onClick:h,children:[e.jsx(k,{className:"h-4 w-4"}),"Reset"]})]}),e.jsx("div",{className:"grid gap-2 sm:grid-cols-2",children:i.map(s=>e.jsxs("button",{type:"button",className:`${n} justify-between`,onClick:()=>o(s),children:[e.jsx("span",{children:s}),s===t?e.jsx("span",{className:"text-muted-foreground",children:"active"}):null]},s))})]})})};C.storyName="Playground";typeof window<"u"&&window.document&&window.document.createElement&&document.documentElement.setAttribute("data-storyloaded","");export{C as Playground};
