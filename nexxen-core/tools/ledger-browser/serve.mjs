import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const routes={'/':['index.html','text/html'],'/style.css':['style.css','text/css'],'/readiness.js':['dist/readiness.js','text/javascript']};
createServer(async(req,res)=>{
  const route=routes[req.url];
  if(req.method!=='GET'||!route){res.writeHead(404);res.end();return;}
  try{const data=await readFile(new URL(route[0],import.meta.url));res.writeHead(200,{'Content-Type':route[1],'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Permissions-Policy':'hid=(self)'});res.end(data);}catch{res.writeHead(503);res.end('Build the local bundle first.');}
}).listen(3002,'127.0.0.1',()=>console.log('Readiness only: http://127.0.0.1:3002'));
