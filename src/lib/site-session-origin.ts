const websiteOrigins=new Set(['https://www.etrylue.com','https://etrylue.com']);
export function allowedOrigin(origin:string|null,requestOrigin:string){return origin===requestOrigin||(requestOrigin==='https://app.etrylue.com'&&origin!==null&&websiteOrigins.has(origin));}
