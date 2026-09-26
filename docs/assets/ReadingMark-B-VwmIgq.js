import{i as r,j as e}from"./index-CO70o6J1.js";import{S as l,H as d}from"./StarRating-cT5JtL8k.js";/**
 * @license lucide-react v0.344.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=r("Check",[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]);function c({state:a,percent:s,rating:n,liked:i,className:t=""}){return a==="unread"?null:a==="reading"?e.jsxs("span",{className:`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-reading ${t}`,children:[e.jsx("span",{"aria-hidden":!0,className:"h-1.5 w-1.5 rounded-full bg-reading"}),"읽는 중",s!=null&&e.jsxs("span",{className:"tnum",children:[s,"%"]})]}):e.jsxs("span",{className:`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-completed-dark ${t}`,children:[e.jsx(x,{"aria-hidden":!0,size:12,strokeWidth:3}),"완독",n?e.jsx(l,{rating:n,size:"xs",readonly:!0}):null,i&&e.jsx(d,{size:11,className:"fill-seal text-seal","aria-label":"인생책"})]})}export{x as C,c as R};
