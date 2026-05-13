import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from "recharts";

// ─── CONFIG ────────────────────────────────────────────────────────────────
const FLAGS = {
  MX:"🇲🇽", CO:"🇨🇴", CL:"🇨🇱", AR:"🇦🇷", PE:"🇵🇪",
  BR:"🇧🇷", EC:"🇪🇨", UY:"🇺🇾", BO:"🇧🇴", US:"🇺🇸", LATAM:"🌎"
};

const SOURCE_URLS = {
  "YC W25":        "https://www.ycombinator.com/companies?batch=W25",
  "YC S24":        "https://www.ycombinator.com/companies?batch=S24",
  "YC W24":        "https://www.ycombinator.com/companies?batch=W24",
  "Crunchbase":    "https://www.crunchbase.com/discover/organization.companies",
  "500 LATAM":     "https://500.co/companies",
  "Startup Chile": "https://www.startupchile.org/companies",
  "Endeavor":      "https://endeavor.org/entrepreneurs",
  "NXTP":          "https://nxtp.vc/portfolio",
  "F6S":           "https://www.f6s.com/companies",
  "LinkedIn":      "https://www.linkedin.com/search/results/companies/?keywords=startup+latam",
};

const CHART_COLORS = ["#10b981","#3b82f6","#f59e0b","#a855f7","#ef4444","#67d0f5","#f97316","#84cc16","#ec4899","#06b6d4"];

// ─── SECTOR CLASSIFIER ─────────────────────────────────────────────────────
// Otro = startups que no encajan claramente en un vertical tech:
// incluye turismo, voluntariado, contenido/creadores, hardware/IoT sin vertical claro,
// conglomerados, o empresas cuya descripción es demasiado genérica para clasificar.
const SECTOR_KEYWORDS = {
  "Fintech":    ["pago","financi","crédito","credito","banco","neobank","inversión","inversion","seguro","fiscal","impuesto","nómina","nomina","tarjeta","bnpl","open banking","token","remesa","factura","tesorería","conciliaci","scoring","billetera","refinanciamiento","deuda"],
  "Healthtech": ["salud","health","médic","medic","telemedicin","farmacia","clínica","clinica","cuidado","mental","odontol","ortodoncia","contact center","bienestar"],
  "Proptech":   ["casa","inmueble","apart","arriendo","renta","propiedad","vivienda","real estate","residencial","conjunto"],
  "Logistics":  ["logístic","logistic","carga","envío","envio","transporte","delivery","última milla","freight","eléctric","domicilio"],
  "Agritech":   ["agro","ganadería","ganaderia","cosecha","agrícola","agricola","campo","climático","climatico","paramétrico","cosech","productor","rancho"],
  "HR & Work":  ["rrhh","nómina","nomina","empleado","talento","recursos humanos","beneficio","asistencia","voluntariado"],
  "Edtech":     ["educaci","inglés","ingles","aprendizaje","learning","universitari","tutor","curso"],
  "Legaltech":  ["legal","contrato","trámite","tramite","jurídico","vehicular"],
  "B2B SaaS":   ["software","saas","api","gestión","gestion","automatiz","erp","analytics","no-code","crm","datos","plataforma","reservas","sistema","pos","facturación","facturacion","verificaci","ingresos"],
  "Commerce":   ["marketplace","ecommerce","retail","vendedor","tienda","moda","belleza","marca","social commerce","dark kitchen","restaurante","loyalty","lealtad","mueble","decoraci","experiencia","turismo"],
};


function getSector(desc) {
  const d = (desc||"").toLowerCase();
  for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
    if (kws.some(k => d.includes(k))) return sector;
  }
  return "Otro";
}

// ─── SCORE & VERDICT ───────────────────────────────────────────────────────
// Weights adjusted for early-stage (pre-seed/seed): team > market > geography > sector > traction
const DIMS = [
  { key:"geography",   label:"Geografía",      w:0.20, icon:"ti-map-pin"      },
  { key:"sector",      label:"Sector",          w:0.15, icon:"ti-cpu"          },
  { key:"traction",    label:"Traction / MVP",  w:0.15, icon:"ti-trending-up"  },
  { key:"market_size", label:"Market Size",     w:0.25, icon:"ti-building-bank"},
  { key:"team",        label:"Team / Founders", w:0.25, icon:"ti-users"        },
];

const scoreCalc = scores => {
  if (!scores) return 0;
  return Math.round(DIMS.reduce((acc, d) => acc + (scores[d.key] || 0) * d.w * 10, 0));
};
const VERDICT = t => t>=70 ? {t:"STRONG FIT",c:"#10b981"} : t>=55 ? {t:"WATCH",c:"#f59e0b"} : {t:"PASS",c:"#ef4444"};

// ─── CSV EXPORT ────────────────────────────────────────────────────────────
function exportCSV(pipeline) {
  const qualified = pipeline
    .map(s => ({ ...s, total: scoreCalc(s.scores) }))
    .filter(s => s.total >= 55)
    .sort((a,b) => b.total - a.total);

  const headers = ["Empresa","País","Etapa","Capital","Score","Verdict","Sector","Fuente","Geografía","Sector Score","Traction","Market Size","Team","Website","Descripción"];
  const rows = qualified.map(s => [
    s.company, s.country, s.stage, s.capital,
    s.total, VERDICT(s.total).t, getSector(s.desc),
    s.source,
    s.scores.geography, s.scores.sector, s.scores.traction,
    s.scores.market_size, s.scores.team,
    s.website || "",
    `"${(s.desc||"").replace(/"/g,'""')}"`,
  ]);

  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `latinleap-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── PIPEDREAM NOTIFY ──────────────────────────────────────────────────────
const PIPEDREAM_URL = "https://eorou0sz44l4udz.m.pipedream.net";

async function notifyPipedream(startup, threshold) {
  const t = scoreCalc(startup.scores);
  if (t < threshold) return { skipped: true };
  const v = VERDICT(t);
  const params = new URLSearchParams({
    company:  startup.company,
    country:  startup.country,
    stage:    startup.stage,
    capital:  startup.capital,
    source:   startup.source,
    score:    String(t),
    verdict:  v.t,
    desc:     (startup.desc || "").slice(0, 120),
    geo:      String(startup.scores.geography   || 0),
    sec:      String(startup.scores.sector      || 0),
    traction: String(startup.scores.traction    || 0),
    market:   String(startup.scores.market_size || 0),
    team:     String(startup.scores.team        || 0),
    website:  (startup.website || "").slice(0, 80),
    sector:   getSector(startup.desc),
  });
  try {
    await fetch(PIPEDREAM_URL + "?" + params.toString());
    return { sent: true };
  } catch(e) {
    return { sent: false };
  }
}

// ─── 66 STARTUPS ───────────────────────────────────────────────────────────
const PIPELINE = [
  { id:1,  company:"Kushki",       country:"EC", stage:"Seed",     capital:"USD 1.5M", source:"Crunchbase",   website:"https://kushki.com",        scores:{geography:9,sector:9,traction:9,market_size:9,team:9},  desc:"Infraestructura de pagos panlatam para ecommerce" },
  { id:2,  company:"Menta",        country:"MX", stage:"Pre-seed", capital:"USD 400K", source:"YC W25",       website:"",                          scores:{geography:9,sector:8,traction:6,market_size:8,team:7},  desc:"BNPL para trabajadores informales en México" },
  { id:3,  company:"Xepelin",      country:"CL", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://xepelin.com",       scores:{geography:8,sector:9,traction:8,market_size:9,team:9},  desc:"Financiamiento de facturas para PYMEs chilenas" },
  { id:4,  company:"Truora",       country:"CO", stage:"Seed",     capital:"USD 1M",   source:"500 LATAM",    website:"https://truora.com",        scores:{geography:9,sector:8,traction:7,market_size:8,team:8},  desc:"Verificación de identidad y background checks LATAM" },
  { id:5,  company:"Fintual",      country:"CL", stage:"Seed",     capital:"USD 2M",   source:"LinkedIn",     website:"https://fintual.com",       scores:{geography:8,sector:9,traction:9,market_size:8,team:9},  desc:"Inversiones automatizadas para millennials hispanohablantes" },
  { id:6,  company:"Clara",        country:"MX", stage:"Seed",     capital:"USD 3M",   source:"Crunchbase",   website:"https://clara.com",         scores:{geography:9,sector:9,traction:8,market_size:9,team:9},  desc:"Tarjetas corporativas y gestión de gastos para empresas" },
  { id:7,  company:"Simetrik",     country:"CO", stage:"Seed",     capital:"USD 1M",   source:"Endeavor",     website:"https://simetrik.com",      scores:{geography:9,sector:8,traction:7,market_size:8,team:8},  desc:"Automatización de conciliaciones financieras B2B" },
  { id:8,  company:"Agave",        country:"MX", stage:"Pre-seed", capital:"USD 600K", source:"YC S24",       website:"",                          scores:{geography:9,sector:8,traction:6,market_size:7,team:8},  desc:"APIs para conectar sistemas de construcción en LATAM" },
  { id:9,  company:"Mango",        country:"CO", stage:"Pre-seed", capital:"USD 500K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:7,traction:5,market_size:7,team:7},  desc:"Neobank para estudiantes universitarios colombianos" },
  { id:10, company:"Vaiu",         country:"AR", stage:"Pre-seed", capital:"USD 350K", source:"NXTP",         website:"",                          scores:{geography:7,sector:8,traction:6,market_size:7,team:7},  desc:"Pagos sin contacto por reconocimiento facial" },
  { id:11, company:"Tuti",         country:"MX", stage:"Pre-seed", capital:"USD 450K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:7,traction:5,market_size:8,team:6},  desc:"Super app financiera para comunidades rurales en México" },
  { id:12, company:"Pulpo",        country:"MX", stage:"Seed",     capital:"USD 1.2M", source:"Crunchbase",   website:"https://pulpoapp.com",      scores:{geography:9,sector:8,traction:7,market_size:8,team:8},  desc:"Plataforma de logística para PYMEs de comercio electrónico" },
  { id:13, company:"Bamba",        country:"PE", stage:"Pre-seed", capital:"USD 500K", source:"Startup Chile",website:"",                          scores:{geography:8,sector:7,traction:5,market_size:7,team:7},  desc:"Microcréditos para microempresarios peruanos no bancarizados" },
  { id:14, company:"Nowports",     country:"MX", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://nowports.com",      scores:{geography:9,sector:8,traction:8,market_size:9,team:8},  desc:"Freight forwarder digital para importadores LATAM" },
  { id:15, company:"Klar",         country:"MX", stage:"Seed",     capital:"USD 2.5M", source:"Crunchbase",   website:"https://klar.mx",           scores:{geography:9,sector:9,traction:8,market_size:9,team:9},  desc:"Banco digital sin comisiones para México" },
  { id:16, company:"Ropeworks",    country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:7,traction:5,market_size:7,team:6},  desc:"SaaS para gestión de inventario de moda en retail" },
  { id:17, company:"Minka",        country:"CO", stage:"Seed",     capital:"USD 1M",   source:"Endeavor",     website:"https://minka.io",          scores:{geography:9,sector:9,traction:7,market_size:8,team:8},  desc:"Red de pagos en tiempo real para bancos colombianos" },
  { id:18, company:"Heru",         country:"MX", stage:"Pre-seed", capital:"USD 600K", source:"YC W24",       website:"https://heru.mx",           scores:{geography:9,sector:8,traction:6,market_size:8,team:8},  desc:"Contabilidad y declaración de impuestos para freelancers MX" },
  { id:19, company:"Beeteller",    country:"MX", stage:"Pre-seed", capital:"USD 500K", source:"F6S",          website:"https://beeteller.com",     scores:{geography:9,sector:8,traction:6,market_size:8,team:7},  desc:"Open banking APIs para desarrolladores en México" },
  { id:20, company:"Talo",         country:"AR", stage:"Pre-seed", capital:"USD 400K", source:"NXTP",         website:"",                          scores:{geography:7,sector:8,traction:5,market_size:7,team:7},  desc:"Infraestructura cripto para empresas hispanohablantes" },
  { id:21, company:"Getbio",       country:"CO", stage:"Pre-seed", capital:"USD 350K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:8,traction:5,market_size:7,team:7},  desc:"Marketplace de insumos médicos para clínicas pequeñas" },
  { id:22, company:"Slang",        country:"CO", stage:"Seed",     capital:"USD 1M",   source:"Crunchbase",   website:"https://slang.com",         scores:{geography:9,sector:8,traction:7,market_size:8,team:8},  desc:"Inglés corporativo con IA para empresas latinoamericanas" },
  { id:23, company:"Saber Salud",  country:"MX", stage:"Pre-seed", capital:"USD 500K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:9,traction:5,market_size:8,team:7},  desc:"Telemedicina primaria para trabajadores informales" },
  { id:24, company:"Aleph",        country:"AR", stage:"Seed",     capital:"USD 1.5M", source:"Crunchbase",   website:"https://alephgroup.io",     scores:{geography:7,sector:8,traction:7,market_size:8,team:8},  desc:"Gestión de pagos globales para nómadas digitales LATAM" },
  { id:25, company:"Finco",        country:"MX", stage:"Pre-seed", capital:"USD 400K", source:"F6S",          website:"",                          scores:{geography:9,sector:8,traction:5,market_size:8,team:6},  desc:"Crédito para empleados vía convenio con empresas" },
  { id:26, company:"Nuvocargo",    country:"MX", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://nuvocargo.com",     scores:{geography:9,sector:8,traction:8,market_size:9,team:8},  desc:"Transporte de carga por carretera entre México y EEUU" },
  { id:27, company:"Graze",        country:"MX", stage:"Pre-seed", capital:"USD 600K", source:"YC W25",       website:"",                          scores:{geography:9,sector:7,traction:5,market_size:8,team:7},  desc:"Plataforma de gestión ganadera con IoT para ranchos MX" },
  { id:28, company:"Moons",        country:"MX", stage:"Seed",     capital:"USD 1.5M", source:"Crunchbase",   website:"https://mymoons.mx",        scores:{geography:9,sector:8,traction:8,market_size:8,team:8},  desc:"Ortodoncia invisible DTC con consultas digitales" },
  { id:29, company:"Inverkids",    country:"MX", stage:"Pre-seed", capital:"USD 300K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:7,traction:5,market_size:7,team:6},  desc:"Educación financiera y cuentas para niños mexicanos" },
  { id:30, company:"Yuno",         country:"CO", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://y.uno",             scores:{geography:9,sector:9,traction:8,market_size:9,team:9},  desc:"Orquestador de pagos para ecommerce en toda LATAM" },
  { id:31, company:"Toku",         country:"CL", stage:"Seed",     capital:"USD 1M",   source:"Startup Chile",website:"https://toku.co",           scores:{geography:8,sector:9,traction:7,market_size:8,team:8},  desc:"Pagos y nómina en tiempo real para empresas chilenas" },
  { id:32, company:"Buk",          country:"CL", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://buk.cl",            scores:{geography:8,sector:8,traction:8,market_size:8,team:8},  desc:"RRHH y nómina todo-en-uno para empresas medianas" },
  { id:33, company:"Muncher",      country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:7,traction:5,market_size:7,team:6},  desc:"Dark kitchen B2B como servicio para restaurantes" },
  { id:34, company:"Avista",       country:"MX", stage:"Pre-seed", capital:"USD 500K", source:"F6S",          website:"",                          scores:{geography:9,sector:8,traction:5,market_size:8,team:7},  desc:"Seguro de salud flexible para empleados de PYMEs" },
  { id:35, company:"Listo",        country:"PE", stage:"Pre-seed", capital:"USD 400K", source:"LinkedIn",     website:"",                          scores:{geography:8,sector:7,traction:5,market_size:7,team:6},  desc:"Marketplace de servicios del hogar en Lima" },
  { id:36, company:"Kiu",          country:"AR", stage:"Seed",     capital:"USD 1M",   source:"NXTP",         website:"https://kiu.com.ar",        scores:{geography:7,sector:8,traction:7,market_size:8,team:7},  desc:"Software de reservas y gestión para aerolíneas regionales" },
  { id:37, company:"Lexi",         country:"MX", stage:"Pre-seed", capital:"USD 350K", source:"YC S24",       website:"",                          scores:{geography:9,sector:8,traction:5,market_size:7,team:7},  desc:"Asistente legal con IA para contratos en español" },
  { id:38, company:"Agrotoken",    country:"AR", stage:"Seed",     capital:"USD 1.5M", source:"Crunchbase",   website:"https://agrotoken.io",      scores:{geography:7,sector:8,traction:7,market_size:8,team:8},  desc:"Tokenización de commodities agrícolas como colateral" },
  { id:39, company:"Jefa",         country:"MX", stage:"Pre-seed", capital:"USD 500K", source:"500 LATAM",    website:"https://jefa.com",          scores:{geography:9,sector:8,traction:6,market_size:8,team:7},  desc:"Neobank enfocado en mujeres emprendedoras de México" },
  { id:40, company:"Yana",         country:"MX", stage:"Pre-seed", capital:"USD 400K", source:"LinkedIn",     website:"https://yana.com.mx",       scores:{geography:9,sector:8,traction:6,market_size:7,team:7},  desc:"App de salud mental con IA en español" },
  { id:41, company:"Casai",        country:"MX", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://casai.com",         scores:{geography:9,sector:7,traction:7,market_size:8,team:8},  desc:"Gestión de apartamentos de renta corta en LATAM" },
  { id:42, company:"Merama",       country:"MX", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://merama.io",         scores:{geography:9,sector:8,traction:8,market_size:9,team:9},  desc:"Adquisición y escalamiento de marcas de ecommerce" },
  { id:43, company:"Flat.mx",      country:"MX", stage:"Seed",     capital:"USD 1.5M", source:"Crunchbase",   website:"https://flat.mx",           scores:{geography:9,sector:8,traction:7,market_size:9,team:8},  desc:"Compra y venta digital de casas en México" },
  { id:44, company:"Houm",         country:"CL", stage:"Seed",     capital:"USD 1.5M", source:"Startup Chile",website:"https://houm.com",          scores:{geography:8,sector:8,traction:7,market_size:8,team:8},  desc:"Proptech de arriendo y venta residencial en Chile y Colombia" },
  { id:45, company:"Aptuno",       country:"CO", stage:"Pre-seed", capital:"USD 600K", source:"500 LATAM",    website:"https://aptuno.com",        scores:{geography:9,sector:7,traction:6,market_size:8,team:7},  desc:"Renta de apartamentos sin fiador en Colombia" },
  { id:46, company:"Vitau",        country:"MX", stage:"Pre-seed", capital:"USD 400K", source:"F6S",          website:"",                          scores:{geography:9,sector:8,traction:5,market_size:8,team:7},  desc:"Farmacia digital con entrega el mismo día en México" },
  { id:47, company:"Sanarai",      country:"MX", stage:"Pre-seed", capital:"USD 500K", source:"YC W25",       website:"",                          scores:{geography:9,sector:9,traction:5,market_size:8,team:7},  desc:"Plataforma de coordinación de cuidado crónico" },
  { id:48, company:"Nomi",         country:"MX", stage:"Pre-seed", capital:"USD 350K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:8,traction:5,market_size:7,team:7},  desc:"Nómina y beneficios flexibles para PYMEs mexicanas" },
  { id:49, company:"Bela",         country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:7,traction:5,market_size:7,team:6},  desc:"Marketplace de belleza y bienestar en Colombia" },
  { id:50, company:"Tread",        country:"CL", stage:"Pre-seed", capital:"USD 500K", source:"Startup Chile",website:"",                          scores:{geography:8,sector:8,traction:5,market_size:7,team:7},  desc:"SaaS de gestión para talleres mecánicos en Chile" },
  { id:51, company:"Platanus",     country:"CL", stage:"Pre-seed", capital:"USD 600K", source:"Startup Chile",website:"https://platanus.tech",     scores:{geography:8,sector:8,traction:6,market_size:7,team:8},  desc:"Studio de software y aceleradora para founders técnicos" },
  { id:52, company:"Moxie",        country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:7,traction:5,market_size:7,team:6},  desc:"Comunidad y financiamiento para creadores colombianos" },
  { id:53, company:"Betterpay",    country:"MX", stage:"Pre-seed", capital:"USD 500K", source:"F6S",          website:"",                          scores:{geography:9,sector:8,traction:6,market_size:8,team:7},  desc:"Terminal de punto de venta móvil para vendedores ambulantes" },
  { id:54, company:"DataSur",      country:"CO", stage:"Pre-seed", capital:"USD 350K", source:"Endeavor",     website:"",                          scores:{geography:9,sector:8,traction:5,market_size:7,team:7},  desc:"Analytics de datos crediticios alternativos para bancos" },
  { id:55, company:"Reworth",      country:"MX", stage:"Pre-seed", capital:"USD 400K", source:"YC S24",       website:"",                          scores:{geography:9,sector:7,traction:5,market_size:8,team:7},  desc:"Cashback y loyalty para bancos y retailers de LATAM" },
  { id:56, company:"Agroclima",    country:"CO", stage:"Pre-seed", capital:"USD 500K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:8,traction:5,market_size:8,team:7},  desc:"Seguro climático paramétrico para pequeños agricultores" },
  { id:57, company:"Elenas",       country:"CO", stage:"Seed",     capital:"USD 1.5M", source:"Crunchbase",   website:"https://elenas.com",        scores:{geography:9,sector:7,traction:7,market_size:8,team:8},  desc:"Social commerce para vendedoras independientes en LATAM" },
  { id:58, company:"Mpower",       country:"MX", stage:"Pre-seed", capital:"USD 400K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:8,traction:5,market_size:8,team:6},  desc:"Crédito educativo para profesionistas jóvenes en México" },
  { id:59, company:"Liftit",       country:"CO", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://liftit.co",         scores:{geography:9,sector:8,traction:8,market_size:9,team:8},  desc:"Plataforma de última milla para empresas en LATAM" },
  { id:60, company:"Teclado",      country:"AR", stage:"Pre-seed", capital:"USD 500K", source:"NXTP",         website:"",                          scores:{geography:7,sector:8,traction:5,market_size:8,team:7},  desc:"No-code para crear apps internas en empresas medianas" },
  { id:61, company:"Bicci",        country:"CL", stage:"Pre-seed", capital:"USD 600K", source:"Startup Chile",website:"https://bicci.cl",          scores:{geography:8,sector:8,traction:6,market_size:8,team:7},  desc:"Última milla eléctrica y sostenible para ecommerce" },
  { id:62, company:"Leal",         country:"CO", stage:"Seed",     capital:"USD 1M",   source:"Endeavor",     website:"https://leal.co",           scores:{geography:9,sector:7,traction:7,market_size:8,team:8},  desc:"Plataforma de lealtad y datos para retailers colombianos" },
  { id:63, company:"Clip",         country:"MX", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://clip.mx",           scores:{geography:9,sector:9,traction:9,market_size:9,team:9},  desc:"Terminal de pagos y servicios financieros para PYMEs MX" },
  { id:64, company:"Gringo",       country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:7,traction:5,market_size:7,team:7},  desc:"Plataforma de trámites vehiculares digitales en Colombia" },
  { id:65, company:"Sempli",       country:"CO", stage:"Seed",     capital:"USD 1M",   source:"Endeavor",     website:"https://sempli.com.co",     scores:{geography:9,sector:8,traction:7,market_size:8,team:8},  desc:"Crédito digital para PYMEs colombianas en 24 horas" },
  { id:66, company:"Tribal",       country:"MX", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://tribal.credit",     scores:{geography:9,sector:9,traction:8,market_size:9,team:9},  desc:"Tarjetas y crédito corporativo para startups de LATAM" },
  // ── Nuevas entradas ──────────────────────────────────────────────────────
  { id:67, company:"Guros",         country:"MX", stage:"Seed",     capital:"USD 1M",   source:"Crunchbase",   website:"https://guros.com",         scores:{geography:9,sector:7,traction:7,market_size:7,team:7},  desc:"Marketplace de seguros de auto en línea para México" },
  { id:68, company:"Fido",          country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:6,traction:4,market_size:6,team:5},  desc:"Crédito para personas sin historial bancario vía scoring alternativo" },
  { id:69, company:"Palenca",       country:"MX", stage:"Pre-seed", capital:"USD 600K", source:"YC W24",       website:"https://palenca.com",       scores:{geography:9,sector:8,traction:6,market_size:8,team:8},  desc:"APIs de verificación de ingresos para trabajadores gig en LATAM" },
  { id:70, company:"Neivor",        country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:6,traction:4,market_size:6,team:5},  desc:"Software de administración para conjuntos residenciales" },
  { id:71, company:"Runa HR",       country:"MX", stage:"Seed",     capital:"USD 1.5M", source:"Crunchbase",   website:"https://runahr.com",        scores:{geography:9,sector:8,traction:7,market_size:8,team:8},  desc:"Plataforma de nómina y RRHH para PYMEs mexicanas" },
  { id:72, company:"Wenabi",        country:"CO", stage:"Pre-seed", capital:"USD 300K", source:"F6S",          website:"",                          scores:{geography:9,sector:5,traction:3,market_size:5,team:5},  desc:"App de voluntariado corporativo para empresas colombianas" },
  { id:73, company:"Adomi",         country:"CO", stage:"Pre-seed", capital:"USD 350K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:5,traction:3,market_size:5,team:4},  desc:"Plataforma de domicilios para restaurantes independientes" },
  { id:74, company:"Worky",         country:"MX", stage:"Seed",     capital:"USD 1M",   source:"500 LATAM",    website:"https://worky.mx",         scores:{geography:9,sector:7,traction:6,market_size:7,team:7},  desc:"Software de RRHH y control de asistencia para empresas MX" },
  { id:75, company:"Fresa",         country:"MX", stage:"Pre-seed", capital:"USD 250K", source:"F6S",          website:"",                          scores:{geography:8,sector:4,traction:3,market_size:4,team:4},  desc:"Marketplace de productores agrícolas locales a restaurantes" },
  { id:76, company:"Gaia Design",   country:"MX", stage:"Seed",     capital:"USD 1M",   source:"Crunchbase",   website:"https://gaiadesign.com.mx", scores:{geography:8,sector:5,traction:6,market_size:6,team:5},  desc:"Tienda de muebles y decoración DTC con diseño propio" },
  { id:77, company:"Instacrédito",  country:"CO", stage:"Pre-seed", capital:"USD 400K", source:"500 LATAM",    website:"",                          scores:{geography:9,sector:6,traction:4,market_size:6,team:5},  desc:"Crédito de libre inversión para empleados formales en Colombia" },
  { id:78, company:"Menta Salud",   country:"MX", stage:"Pre-seed", capital:"USD 350K", source:"LinkedIn",     website:"",                          scores:{geography:9,sector:8,traction:4,market_size:7,team:6},  desc:"Plataforma de salud mental para empresas medianas en México" },
  { id:79, company:"Bsale",         country:"CL", stage:"Seed",     capital:"USD 1M",   source:"Startup Chile",website:"https://bsale.cl",          scores:{geography:8,sector:7,traction:7,market_size:7,team:7},  desc:"POS y facturación electrónica para negocios en Chile y Perú" },
  { id:80, company:"Defontana",     country:"CL", stage:"Seed",     capital:"USD 2M",   source:"Crunchbase",   website:"https://defontana.com",     scores:{geography:8,sector:6,traction:5,market_size:6,team:5},  desc:"ERP en la nube para empresas medianas en Chile" },
  { id:81, company:"Lokal",         country:"CO", stage:"Pre-seed", capital:"USD 300K", source:"F6S",          website:"",                          scores:{geography:9,sector:5,traction:3,market_size:5,team:4},  desc:"Plataforma de turismo local y experiencias auténticas en Colombia" },
  { id:82, company:"Tutorez",       country:"PE", stage:"Pre-seed", capital:"USD 250K", source:"LinkedIn",     website:"",                          scores:{geography:7,sector:5,traction:3,market_size:5,team:4},  desc:"Marketplace de tutores particulares en Perú" },
  { id:83, company:"Geti",          country:"BR", stage:"Pre-seed", capital:"USD 500K", source:"NXTP",         website:"",                          scores:{geography:4,sector:6,traction:4,market_size:7,team:5},  desc:"Pagos instantáneos para pequeños comercios en Brasil vía Pix" },
  { id:84, company:"Solventa",      country:"AR", stage:"Pre-seed", capital:"USD 300K", source:"NXTP",         website:"",                          scores:{geography:5,sector:6,traction:3,market_size:5,team:5},  desc:"Consolidación y refinanciamiento de deudas personales en Argentina" },
  { id:85, company:"Coink",         country:"CO", stage:"Seed",     capital:"USD 1M",   source:"Endeavor",     website:"https://coink.com.co",      scores:{geography:9,sector:7,traction:6,market_size:7,team:7},  desc:"Billetera digital con alcancías físicas para el segmento popular" },
  { id:86, company:"Securitec",     country:"PE", stage:"Seed",     capital:"USD 1M",   source:"Crunchbase",   website:"https://securitec.pe",      scores:{geography:7,sector:6,traction:5,market_size:6,team:6},  desc:"Plataforma de contact center omnicanal para empresas en Perú" },
];

const SOURCES = ["Todas", ...[...new Set(PIPELINE.map(s=>s.source))].sort()];
const STAGES   = ["Todas","Pre-seed","Seed","Idea Stage"];
const SECTORS  = ["Todas",...Object.keys(SECTOR_KEYWORDS),"Otro"];

// ─── UI HELPERS ────────────────────────────────────────────────────────────
function Tag({label,color}){
  const map={green:"rgba(16,185,129,.15) #10b981",amber:"rgba(245,158,11,.15) #f59e0b",red:"rgba(239,68,68,.15) #ef4444",blue:"rgba(59,130,246,.15) #93c5fd",purple:"rgba(168,85,247,.15) #c4b5fd",teal:"rgba(103,208,245,.15) #67d0f5"};
  const [bg,clr]=(map[color]||map.blue).split(" ");
  return <span style={{fontSize:10,fontFamily:"monospace",padding:"2px 8px",borderRadius:99,background:bg,color:clr,border:`1px solid ${clr}33`,whiteSpace:"nowrap"}}>{label}</span>;
}

function ScoreBar({v}){
  const val = v || 0;
  const c=val>=8?"#10b981":val>=6?"#f59e0b":"#ef4444";
  return(
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{flex:1,height:3,background:"#e5e7eb",borderRadius:99,overflow:"hidden"}}>
        <div style={{width:`${val*10}%`,height:"100%",background:c,borderRadius:99,transition:"width .6s ease"}}/>
      </div>
      <span style={{fontSize:11,fontFamily:"monospace",color:c,width:14,textAlign:"right"}}>{val}</span>
    </div>
  );
}

// ─── CARD ──────────────────────────────────────────────────────────────────
function Card({s,onSelect,active}){
  const t=scoreCalc(s.scores);
  const v=VERDICT(t);
  return(
    <div onClick={()=>onSelect(s)} style={{cursor:"pointer",borderRadius:12,padding:"11px 13px",transition:"all .15s",
      border:`1px solid ${active?"#10b981":"#e5e7eb"}`,
      background:active?"#ecfdf5":"#ffffff"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            <span style={{fontSize:14}}>{FLAGS[s.country]||"🌎"}</span>
            <span style={{fontWeight:700,color:"#111827",fontSize:13}}>{s.company}</span>
            <span style={{fontSize:10,color:"#9ca3af",fontFamily:"monospace"}}>{s.country}</span>
          </div>
          <p style={{fontSize:11,color:"#6b7280",margin:"3px 0 0",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{s.desc}</p>
        </div>
        <div style={{textAlign:"right",marginLeft:10,flexShrink:0}}>
          <div style={{fontSize:20,fontWeight:900,fontFamily:"monospace",color:v.c,lineHeight:1}}>{t}</div>
          <span style={{fontSize:9,fontFamily:"monospace",color:v.c}}>{v.t}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:5,marginTop:7,flexWrap:"wrap"}}>
        <Tag label={s.stage} color="purple"/>
        <Tag label={s.capital} color="amber"/>
        <Tag label={s.source} color="teal"/>
      </div>
    </div>
  );
}

// ─── DETAIL ────────────────────────────────────────────────────────────────
function Detail({s,threshold}){
  const t=scoreCalc(s.scores);
  const v=VERDICT(t);
  const [copied,setCopied]=useState(false);
  const [tgState,setTgState]=useState(null);

  const handleCopy=()=>{
    const bar = n => { const f=Math.round((n||0)/2); return "█".repeat(f)+"░".repeat(5-f)+" "+(n||0)+"/10"; };
    const vEmoji = v.t==="STRONG FIT"?"🟢":v.t==="WATCH"?"🟡":"🔴";
    const bullets=[];
    if((s.scores.geography||0)>=8)   bullets.push("Opera en mercados core de LATAM hispanohablante");
    if((s.scores.team||0)>=8)        bullets.push("Equipo fundador excepcional para etapa idea/MVP");
    if((s.scores.market_size||0)>=8) bullets.push("Mercado grande con potencial de escala en LATAM");
    if((s.scores.traction||0)>=6)    bullets.push("MVP o primeros usuarios con señales de validación");
    if((s.scores.sector||0)>=8)      bullets.push("Sector con alto potencial de crecimiento en LATAM");
    if((s.scores.team||0)>=7 && (s.scores.traction||0)<=4) bullets.push("Equipo sólido compensando etapa muy temprana sin producto");
    while(bullets.length<3) bullets.push("Perfil consistente con tesis pre-seed/seed Latin Leap");
    const summary=[
      `${vEmoji} ${s.company} — ${v.t}`,"",
      s.desc||"","","📋 Ficha",
      `${FLAGS[s.country]||"🌎"} País: ${s.country}   Sector: ${getSector(s.desc)}`,
      `Stage: ${s.stage}   Capital: ${s.capital}`,
      `Fuente: ${s.source}`,s.website?`Web: ${s.website}`:null,
      "","💡 Por qué llama la atención",
      ...bullets.slice(0,3).map(b=>`• ${b}`),
      "","📊 Scorecard — "+t+"/100",
      `Geografía   ${bar(s.scores.geography)}`,`Sector      ${bar(s.scores.sector)}`,
      `Traction    ${bar(s.scores.traction)}`,`Market Size ${bar(s.scores.market_size)}`,
      `Team        ${bar(s.scores.team)}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(summary).then(()=>{
      setCopied(true); setTimeout(()=>setCopied(false),3000);
    }).catch(()=>{
      const ta=document.createElement("textarea");
      ta.value=summary; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      setCopied(true); setTimeout(()=>setCopied(false),3000);
    });
  };

  const handleTelegram=async()=>{
    if(t<threshold){setTgState("skipped");setTimeout(()=>setTgState(null),3000);return;}
    setTgState("sending");
    const res=await notifyPipedream(s,threshold);
    setTgState(res.sent?"sent":"fail");
    setTimeout(()=>setTgState(null),4000);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontSize:28}}>{FLAGS[s.country]||"🌎"}</span>
            <div>
              <h3 style={{fontSize:17,fontWeight:900,color:"#111827",margin:0}}>{s.company}</h3>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                <span style={{fontSize:11,color:"#9ca3af",fontFamily:"monospace"}}>{s.country}</span>
                <span style={{fontSize:10,color:"#d1d5db"}}>·</span>
                <Tag label={getSector(s.desc)} color="teal"/>
              </div>
            </div>
          </div>
          <p style={{fontSize:11,color:"#6b7280",margin:0}}>{s.desc}</p>
        </div>
        <div style={{textAlign:"right",marginLeft:12,flexShrink:0}}>
          <span style={{fontSize:32,fontWeight:900,fontFamily:"monospace",color:v.c}}>{t}</span>
          <span style={{fontSize:11,color:"#9ca3af"}}>/100</span>
          <div style={{fontSize:10,fontFamily:"monospace",color:v.c,marginTop:2}}>{v.t}</div>
        </div>
      </div>

      {/* Metadata grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {[["Stage",s.stage],["Capital",s.capital],["Source",s.source],["País",`${FLAGS[s.country]||""} ${s.country}`]].map(([k,val])=>(
          <div key={k} style={{background:"#f9fafb",borderRadius:8,padding:"7px 10px",border:"1px solid #e5e7eb"}}>
            <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.1em"}}>{k}</div>
            <div style={{fontFamily:"monospace",fontWeight:700,color:"#111827",fontSize:12,marginTop:2}}>{val}</div>
          </div>
        ))}
      </div>

      {/* Links */}
      {(s.website || SOURCE_URLS[s.source]) && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {s.website && (
            <a href={s.website} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#67d0f5",textDecoration:"none",background:"rgba(103,208,245,.08)",border:"1px solid rgba(103,208,245,.2)",padding:"5px 10px",borderRadius:8}}>
              <i className="ti ti-world" style={{fontSize:12}} aria-hidden="true"/>
              Website
            </a>
          )}
          {SOURCE_URLS[s.source] && (
            <a href={SOURCE_URLS[s.source]} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#a78bfa",textDecoration:"none",background:"rgba(167,139,250,.08)",border:"1px solid rgba(167,139,250,.2)",padding:"5px 10px",borderRadius:8}}>
              <i className="ti ti-external-link" style={{fontSize:12}} aria-hidden="true"/>
              {s.source}
            </a>
          )}
        </div>
      )}

      {/* Scorecard */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.1em"}}>Scorecard</div>
        {DIMS.map(d=>(
          <div key={d.key}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:11,color:"#374151"}}>
                <i className={`ti ${d.icon}`} style={{fontSize:12,marginRight:4}} aria-hidden="true"/>{d.label}
              </span>
              <span style={{fontSize:9,color:"#9ca3af",fontFamily:"monospace"}}>×{d.w*100}%</span>
            </div>
            <ScoreBar v={s.scores[d.key]}/>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4,paddingTop:8,borderTop:"1px solid #e5e7eb"}}>
          <span style={{fontSize:10,color:"#6b7280"}}>Score total</span>
          <span style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:v.c}}>{t}/100</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{display:"flex",gap:8}}>
        <button onClick={handleTelegram} disabled={tgState==="sending"} style={{
          flex:1,padding:"10px 0",borderRadius:10,fontSize:11,cursor:"pointer",border:"none",
          fontFamily:"monospace",fontWeight:700,
          background:tgState==="sent"?"#d1fae5":tgState==="skipped"?"#fef3c7":tgState==="fail"?"#fee2e2":"#e0f2fe",
          color:tgState==="sent"?"#059669":tgState==="skipped"?"#92400e":tgState==="fail"?"#dc2626":"#0369a1"
        }}>
          <i className="ti ti-brand-telegram" style={{fontSize:13,marginRight:5}} aria-hidden="true"/>
          {tgState==="sending"?"Enviando..."
            :tgState==="sent"?"✓ Enviado"
            :tgState==="skipped"?`Score ${t} < umbral`
            :tgState==="fail"?"Error"
            :"Enviar a Telegram"}
        </button>
        <button onClick={handleCopy} style={{
          flex:1,padding:"10px 0",borderRadius:10,fontSize:11,cursor:"pointer",border:"none",
          fontFamily:"monospace",fontWeight:700,
          background:copied?"#d1fae5":"#f3f4f6",
          color:copied?"#059669":"#6b7280"
        }}>
          <i className={`ti ${copied?"ti-check":"ti-copy"}`} style={{fontSize:13,marginRight:5}} aria-hidden="true"/>
          {copied?"✓ Copiado":"Copiar resumen"}
        </button>
      </div>
    </div>
  );
}

// ─── CHARTS FULL WIDTH ────────────────────────────────────────────────────
function ChartsFullWidth({pipeline}){
  const VERDICT_COLORS={"STRONG FIT":"#10b981","WATCH":"#f59e0b","PASS":"#ef4444"};

  const bySector=useMemo(()=>{
    const m={};
    pipeline.forEach(s=>{const sec=getSector(s.desc);m[sec]=(m[sec]||0)+1;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
  },[pipeline]);

  const sectorByVerdict=useMemo(()=>{
    const m={};
    pipeline.forEach(s=>{
      const sec=getSector(s.desc);
      const v=VERDICT(scoreCalc(s.scores)).t;
      if(!m[sec]) m[sec]={"STRONG FIT":0,"WATCH":0,"PASS":0};
      m[sec][v]++;
    });
    return Object.entries(m).sort((a,b)=>
      (b[1]["STRONG FIT"]+b[1]["WATCH"])-(a[1]["STRONG FIT"]+a[1]["WATCH"])
    ).map(([name,d])=>({name,...d}));
  },[pipeline]);

  const byVerdict=useMemo(()=>{
    const m={};
    pipeline.forEach(s=>{const v=VERDICT(scoreCalc(s.scores)).t;m[v]=(m[v]||0)+1;});
    return Object.entries(m).map(([name,value])=>({name,value}));
  },[pipeline]);

  const byStage=useMemo(()=>[
    {name:"Pre-seed",value:pipeline.filter(s=>s.stage==="Pre-seed").length},
    {name:"Seed",    value:pipeline.filter(s=>s.stage==="Seed").length},
  ],[pipeline]);

  const byCountry=useMemo(()=>{
    const m={};
    pipeline.forEach(s=>{m[s.country]=(m[s.country]||0)+1;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8)
      .map(([c,v])=>({name:`${FLAGS[c]||""} ${c}`,value:v}));
  },[pipeline]);

  const countryByVerdict=useMemo(()=>{
    const m={};
    pipeline.forEach(s=>{
      const key=`${FLAGS[s.country]||""} ${s.country}`;
      const v=VERDICT(scoreCalc(s.scores)).t;
      if(!m[key]) m[key]={"STRONG FIT":0,"WATCH":0,"PASS":0};
      m[key][v]++;
    });
    return Object.entries(m).sort((a,b)=>b[1]["STRONG FIT"]-a[1]["STRONG FIT"])
      .slice(0,8).map(([name,d])=>({name,...d}));
  },[pipeline]);

  const byCapital=useMemo(()=>{
    const m={"<200K":0,"200K–500K":0,"500K–1M":0,"1M–5M":0};
    pipeline.forEach(s=>{
      const n=parseFloat(s.capital.replace(/[^0-9.]/g,""));
      const usd=s.capital.includes("M")?n*1000:n;
      if(usd<200)m["<200K"]++;else if(usd<500)m["200K–500K"]++;
      else if(usd<1000)m["500K–1M"]++;else m["1M–5M"]++;
    });
    return Object.entries(m).map(([name,value])=>({name,value}));
  },[pipeline]);

  const scoreDistrib=useMemo(()=>{
    const b={"<45":0,"45–54":0,"55–64":0,"65–74":0,"75–84":0,"85+":0};
    pipeline.forEach(s=>{
      const t=scoreCalc(s.scores);
      if(t<45)b["<45"]++;else if(t<55)b["45–54"]++;else if(t<65)b["55–64"]++;
      else if(t<75)b["65–74"]++;else if(t<85)b["75–84"]++;else b["85+"]++;
    });
    return Object.entries(b).map(([name,value])=>({name,value}));
  },[pipeline]);

  const avgDims=useMemo(()=>
    DIMS.map(d=>({dim:d.label,avg:pipeline.length?Math.round(pipeline.reduce((a,s)=>a+(s.scores[d.key]||0),0)/pipeline.length*10)/10:0}))
  ,[pipeline]);

  const bySource=useMemo(()=>{
    const m={};
    pipeline.forEach(s=>{m[s.source]=(m[s.source]||0)+1;});
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
  },[pipeline]);

  const stageByCountry=useMemo(()=>{
    const m={};
    pipeline.forEach(s=>{
      const key=`${FLAGS[s.country]||""} ${s.country}`;
      if(!m[key]) m[key]={"Pre-seed":0,"Seed":0};
      m[key][s.stage]++;
    });
    return Object.entries(m).sort((a,b)=>(b[1]["Pre-seed"]+b[1]["Seed"])-(a[1]["Pre-seed"]+a[1]["Seed"]))
      .slice(0,8).map(([name,d])=>({name,...d}));
  },[pipeline]);

  const Box=({title,children,span})=>(
    <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:14,padding:16,gridColumn:span?`span ${span}`:undefined}}>
      <div style={{fontSize:10,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>{title}</div>
      {children}
    </div>
  );

  const T=({active,payload,label})=>{
    if(!active||!payload?.length) return null;
    return(
      <div style={{background:"#111827",border:"1px solid #374151",borderRadius:8,padding:"7px 10px"}}>
        <p style={{fontSize:11,color:"#9ca3af",margin:"0 0 3px",fontFamily:"monospace"}}>{label||payload[0]?.name}</p>
        {payload.map((p,i)=>(
          <p key={i} style={{fontSize:12,fontWeight:700,color:p.fill||"#10b981",margin:"1px 0",fontFamily:"monospace"}}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  };

  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>

      {/* Sector composition — span 2 */}
      <Box title="Composición sectorial — Otro: startups sin vertical tech definido (hardware genérico, modelos híbridos, descripción insuficiente)" span={2}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bySector} layout="vertical" margin={{top:0,right:30,left:10,bottom:0}}>
            <XAxis type="number" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:"#6b7280"}} axisLine={false} tickLine={false} width={75}/>
            <Tooltip content={<T/>}/>
            <Bar dataKey="value" radius={[0,5,5,0]}>
              {bySector.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Verdict donut */}
      <Box title="Clasificación">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={byVerdict} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
              {byVerdict.map((e,i)=><Cell key={i} fill={VERDICT_COLORS[e.name]||CHART_COLORS[i]}/>)}
            </Pie>
            <Tooltip content={<T/>}/>
          </PieChart>
        </ResponsiveContainer>
        <div style={{display:"flex",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
          {byVerdict.map((e,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:VERDICT_COLORS[e.name]}}/>
              <span style={{fontSize:10,color:"#6b7280",fontFamily:"monospace"}}>{e.name} {e.value}</span>
            </div>
          ))}
        </div>
      </Box>

      {/* Sector quality — stacked — span 2 */}
      <Box title="Calidad por sector (Strong Fit / Watch / Pass)" span={2}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={sectorByVerdict} layout="vertical" margin={{top:0,right:10,left:10,bottom:0}}>
            <XAxis type="number" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:"#6b7280"}} axisLine={false} tickLine={false} width={75}/>
            <Tooltip content={<T/>}/>
            <Bar dataKey="STRONG FIT" stackId="a" fill="#10b981" radius={[0,0,0,0]}/>
            <Bar dataKey="WATCH"      stackId="a" fill="#f59e0b"/>
            <Bar dataKey="PASS"       stackId="a" fill="#ef4444" radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Stage donut */}
      <Box title="Pre-seed vs Seed">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={byStage} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value">
              <Cell fill="#a855f7"/><Cell fill="#3b82f6"/>
            </Pie>
            <Tooltip content={<T/>}/>
          </PieChart>
        </ResponsiveContainer>
        <div style={{display:"flex",justifyContent:"center",gap:12}}>
          {byStage.map((e,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:i===0?"#a855f7":"#3b82f6"}}/>
              <span style={{fontSize:10,color:"#6b7280",fontFamily:"monospace"}}>{e.name} {e.value}</span>
            </div>
          ))}
        </div>
      </Box>

      {/* Country stacked */}
      <Box title="Deals por país" span={2}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={countryByVerdict} layout="vertical" margin={{top:0,right:10,left:5,bottom:0}}>
            <XAxis type="number" tick={{fontSize:10,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:"#6b7280"}} axisLine={false} tickLine={false} width={60}/>
            <Tooltip content={<T/>}/>
            <Bar dataKey="STRONG FIT" stackId="a" fill="#10b981"/>
            <Bar dataKey="WATCH"      stackId="a" fill="#f59e0b"/>
            <Bar dataKey="PASS"       stackId="a" fill="#ef4444" radius={[0,4,4,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Radar */}
      <Box title="Score por dimensión">
        <ResponsiveContainer width="100%" height={180}>
          <RadarChart data={avgDims}>
            <PolarGrid stroke="#e5e7eb"/>
            <PolarAngleAxis dataKey="dim" tick={{fontSize:9,fill:"#6b7280"}}/>
            <Radar dataKey="avg" stroke="#10b981" fill="#10b981" fillOpacity={0.2}/>
            <Tooltip content={<T/>}/>
          </RadarChart>
        </ResponsiveContainer>
      </Box>

      {/* Score distribution */}
      <Box title="Distribución de scores">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={scoreDistrib} margin={{top:0,right:0,left:-20,bottom:0}}>
            <XAxis dataKey="name" tick={{fontSize:10,fill:"#6b7280"}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:9,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <Tooltip content={<T/>}/>
            <Bar dataKey="value" radius={[4,4,0,0]}>
              {scoreDistrib.map((e,i)=>(
                <Cell key={i} fill={e.name==="85+"||e.name==="75–84"?"#10b981":e.name==="65–74"||e.name==="55–64"?"#f59e0b":"#ef4444"}/>
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Capital */}
      <Box title="Ticket size">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={byCapital} margin={{top:0,right:0,left:-20,bottom:0}}>
            <XAxis dataKey="name" tick={{fontSize:10,fill:"#6b7280"}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:9,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <Tooltip content={<T/>}/>
            <Bar dataKey="value" radius={[4,4,0,0]}>
              {byCapital.map((_,i)=><Cell key={i} fill={["#a855f7","#3b82f6","#10b981","#f59e0b"][i]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Stage by country */}
      <Box title="Pre-seed vs Seed por país" span={2}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={stageByCountry} margin={{top:0,right:10,left:-10,bottom:0}}>
            <XAxis dataKey="name" tick={{fontSize:11,fill:"#6b7280"}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:9,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <Tooltip content={<T/>}/>
            <Bar dataKey="Pre-seed" stackId="a" fill="#a855f7"/>
            <Bar dataKey="Seed"     stackId="a" fill="#3b82f6" radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Source */}
      <Box title="Por fuente">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={bySource} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
            <XAxis type="number" tick={{fontSize:9,fill:"#9ca3af"}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:"#6b7280"}} axisLine={false} tickLine={false} width={80}/>
            <Tooltip content={<T/>}/>
            <Bar dataKey="value" radius={[0,4,4,0]}>
              {bySource.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

    </div>
  );
}

// ─── SETTINGS ──────────────────────────────────────────────────────────────
function Settings({threshold,onSave}){
  const [th,setTh]=useState(threshold);
  const thColor=th>=75?"#10b981":th>=60?"#f59e0b":"#ef4444";
  const thLabel=th>=75?"Solo STRONG FIT (≥75)":th>=60?"WATCH y STRONG FIT (≥60)":"Todas";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.1em"}}>
        <i className="ti ti-settings" style={{fontSize:12,marginRight:5}} aria-hidden="true"/>Configuración
      </div>
      <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:12}}>
        <div style={{fontSize:10,color:"#0369a1",marginBottom:8,fontWeight:700}}>
          <i className="ti ti-brand-telegram" style={{fontSize:12,marginRight:5}} aria-hidden="true"/>Automatización activa
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {[{n:"Pipedream",c:"#a855f7"},{n:"→",a:true},{n:"Claude API",c:"#10b981"},{n:"→",a:true},{n:"Telegram",c:"#67d0f5"}].map((item,i)=>
            item.a?<span key={i} style={{color:"#6b7280"}}>→</span>
            :<span key={i} style={{fontSize:10,fontFamily:"monospace",padding:"2px 8px",borderRadius:99,background:`${item.c}20`,color:item.c,border:`1px solid ${item.c}35`}}>{item.n}</span>
          )}
        </div>
        <p style={{fontSize:10,color:"#6b7280",margin:0,lineHeight:1.6}}>
          Las notificaciones corren automáticamente en Pipedream cada lunes a las 9am.<br/>
          Criterios ajustados para empresas early-stage: pre-seed $100K–$1M, seed $1M–$5M.
        </p>
      </div>
      <div style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color:"#6b7280"}}>Score mínimo para notificar</span>
          <span style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:thColor}}>{th}<span style={{fontSize:10,color:"#9ca3af"}}>/100</span></span>
        </div>
        <input type="range" min={0} max={100} step={5} value={th} onChange={e=>setTh(Number(e.target.value))}
          style={{width:"100%",accentColor:thColor,cursor:"pointer"}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#9ca3af",fontFamily:"monospace"}}>
          <span>0</span><span>60</span><span>75</span><span>100</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:7,background:`${thColor}15`,border:`1px solid ${thColor}30`}}>
          <i className="ti ti-filter" style={{fontSize:12,color:thColor}} aria-hidden="true"/>
          <span style={{fontSize:10,color:thColor,fontFamily:"monospace"}}>{thLabel}</span>
        </div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>onSave(th)} style={{flex:1,padding:"9px 0",borderRadius:8,fontSize:11,fontFamily:"monospace",fontWeight:700,background:"rgba(16,185,129,.15)",color:"#10b981",border:"1px solid rgba(16,185,129,.25)",cursor:"pointer"}}>
          Guardar umbral
        </button>
        <button onClick={()=>notifyPipedream({
            company:"Latin Leap TEST",country:"CO",stage:"Pre-seed",capital:"USD 500K",
            source:"YC W25",website:"https://latinleap.com",
            desc:"Plataforma de dealflow VC para LATAM",
            scores:{geography:9,sector:9,traction:8,market_size:9,team:9}
          },0).then(r=>alert(r.sent?"✅ Enviado a Telegram":"❌ Falló — verifica Pipedream"))}
          style={{flex:1,padding:"9px 0",borderRadius:8,fontSize:11,fontFamily:"monospace",fontWeight:700,cursor:"pointer",border:"none",background:"rgba(103,208,245,.12)",color:"#67d0f5"}}>
          Probar Telegram
        </button>
      </div>
    </div>
  );
}

// ─── FILTER GROUP ─────────────────────────────────────────────────────────
function FilterGroup({label, opts, active, onToggle, onClear, wrap=false}){
  const hasActive = active.size > 0;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.1em"}}>{label}</span>
        {hasActive&&(
          <button onClick={onClear} style={{fontSize:9,color:"rgba(239,68,68,.6)",background:"none",border:"none",cursor:"pointer",fontFamily:"monospace",padding:0}}>
            limpiar
          </button>
        )}
      </div>
      <div style={{display:"flex",flexWrap:wrap?"wrap":"nowrap",gap:4,overflowX:wrap?"visible":"auto",paddingBottom:2}}>
        {opts.map(o=>{
          const on=active.has(o);
          return(
            <button key={o} onClick={()=>onToggle(o)} style={{
              flexShrink:0,padding:"3px 8px",borderRadius:99,fontSize:9,cursor:"pointer",
              fontFamily:"monospace",fontWeight:700,whiteSpace:"nowrap",
              background:on?"#e0f2fe":"#f3f4f6",
              color:on?"#0369a1":"#6b7280",
              border:on?"1px solid #7dd3fc":"1px solid transparent",
              transition:"all .15s"}}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────────────────────────
export default function App(){
  const [pipeline]    = useState(PIPELINE);
  const [selected,setSelected] = useState(PIPELINE[0]);
  const [tab,setTab]  = useState("pipeline");
  const [filterSrc,setFilterSrc]     = useState(new Set());
  const [filterStage,setFilterStage] = useState(new Set());
  const [filterSector,setFilterSector] = useState(new Set());
  const [sortBy,setSortBy]           = useState("score");

  const toggleFilter = (setter, val) => setter(prev => {
    const next = new Set(prev);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  });
  const [threshold,setThreshold]     = useState(70);

  const filtered=useMemo(()=>{
    let p=[...pipeline];
    if(filterSrc.size>0)    p=p.filter(s=>filterSrc.has(s.source));
    if(filterStage.size>0)  p=p.filter(s=>filterStage.has(s.stage));
    if(filterSector.size>0) p=p.filter(s=>filterSector.has(getSector(s.desc)));
    if(sortBy==="score") p.sort((a,b)=>scoreCalc(b.scores)-scoreCalc(a.scores));
    else p.sort((a,b)=>a.company.localeCompare(b.company));
    return p;
  // Sets are compared by reference — new Set() in toggleFilter always triggers recompute
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pipeline,sortBy,filterSrc,filterStage,filterSector]);

  const avg    = Math.round(pipeline.reduce((a,s)=>a+scoreCalc(s.scores),0)/pipeline.length);
  const strong = pipeline.filter(s=>scoreCalc(s.scores)>=70).length;
  const watch  = pipeline.filter(s=>{ const t=scoreCalc(s.scores); return t>=55&&t<70; }).length;

  const TABS=[
    {id:"pipeline",label:"Pipeline", icon:"ti-list"},
    {id:"charts",  label:"Métricas", icon:"ti-chart-bar"},
    {id:"settings",label:"Ajustes",  icon:"ti-settings"},
  ];

  return(
    <div style={{minHeight:"100vh",color:"#111827",background:"#f9fafb",fontFamily:"'IBM Plex Mono',monospace",padding:16,boxSizing:"border-box"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css');
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px}
        select{-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(0,0,0,0.4)'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;padding-right:24px!important}
        a:hover{opacity:.8}
      `}</style>

      <div style={{maxWidth:920,margin:"0 auto",display:"flex",flexDirection:"column",gap:14}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",paddingTop:8}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:"#10b981",boxShadow:"none"}}/>
              <span style={{fontSize:9,color:"#10b981",textTransform:"uppercase",letterSpacing:"0.15em"}}>Live</span>
            </div>
            <h1 style={{fontSize:19,fontWeight:900,color:"#111827",margin:"4px 0 0",letterSpacing:"-0.02em"}}>
              LATIN LEAP<span style={{color:"#10b981"}}>.</span>DEALFLOW
            </h1>
            <p style={{fontSize:10,color:"#6b7280",margin:"2px 0 0"}}>Pre-seed $100K–$1M · Seed $1M–$5M · LATAM Early Stage</p>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:9,color:"#9ca3af"}}>Deals en pipeline</div>
              <div style={{fontFamily:"monospace",fontWeight:700,color:"#111827",fontSize:16}}>{pipeline.length}<span style={{color:"#6b7280"}}>/66</span></div>
              <div style={{fontSize:10,color:"#10b981"}}>+{Math.max(0,Math.round((pipeline.length/60-1)*100))}% vs baseline</div>
            </div>
            <button
              onClick={()=>exportCSV(pipeline)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:8,fontSize:11,
                fontFamily:"monospace",fontWeight:700,cursor:"pointer",
                background:"rgba(16,185,129,.15)",color:"#10b981",border:"1px solid rgba(16,185,129,.3)"}}>
              <i className="ti ti-download" style={{fontSize:13}} aria-hidden="true"/>
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[
            ["En pipeline", pipeline.length, `+${Math.max(0,pipeline.length-60)} vs baseline`, "#10b981"],
            ["Strong Fit",  strong,           `${Math.round(strong/pipeline.length*100)}% del total`, "#10b981"],
            ["Watch",       watch,            `${Math.round(watch/pipeline.length*100)}% del total`,  "#f59e0b"],
            ["Score Prom.", avg,              "/100 pts", "#67d0f5"],
          ].map(([l,v,s,c])=>(
            <div key={l} style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:12,padding:"10px 12px"}}>
              <div style={{fontSize:22,fontWeight:900,color:"#111827",fontFamily:"monospace",lineHeight:1}}>{v}</div>
              <div style={{fontSize:9,color:"#9ca3af",marginTop:3,textTransform:"uppercase",letterSpacing:"0.08em"}}>{l}</div>
              <div style={{fontSize:10,color:c,fontFamily:"monospace",marginTop:4}}>{s}</div>
            </div>
          ))}
        </div>

        {/* Tab bar — always full width */}
        <div style={{display:"flex",gap:6}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:1,padding:"7px 0",borderRadius:8,fontSize:10,textTransform:"uppercase",
              letterSpacing:"0.08em",cursor:"pointer",fontFamily:"monospace",fontWeight:700,
              background:tab===t.id?"#ecfdf5":"transparent",
              color:tab===t.id?"#059669":"#9ca3af",
              border:tab===t.id?"1px solid #6ee7b7":"1px solid transparent"}}>
              <i className={`ti ${t.icon}`} style={{fontSize:12,marginRight:4}} aria-hidden="true"/>{t.label}
            </button>
          ))}
        </div>

        {/* Pipeline — 2 col */}
        {tab==="pipeline"&&(
          <div style={{display:"grid",gridTemplateColumns:"minmax(0,2fr) minmax(0,3fr)",gap:14}}>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Filters */}
              <FilterGroup label="Fuente" opts={SOURCES.slice(1)} active={filterSrc} onToggle={v=>toggleFilter(setFilterSrc,v)} onClear={()=>setFilterSrc(new Set())}/>
              <FilterGroup label="Etapa"  opts={STAGES.slice(1)}  active={filterStage} onToggle={v=>toggleFilter(setFilterStage,v)} onClear={()=>setFilterStage(new Set())}/>
              <FilterGroup label="Industria" opts={SECTORS.slice(1)} active={filterSector} onToggle={v=>toggleFilter(setFilterSector,v)} onClear={()=>setFilterSector(new Set())} wrap/>
              {/* Sort */}
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:9,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.1em",flexShrink:0}}>Orden</span>
                {["score","nombre"].map(o=>(
                  <button key={o} onClick={()=>setSortBy(o)} style={{padding:"3px 10px",borderRadius:99,fontSize:10,cursor:"pointer",fontFamily:"monospace",fontWeight:700,border:"none",
                    background:sortBy===o?"#ecfdf5":"#f3f4f6",
                    color:sortBy===o?"#059669":"#6b7280"}}>
                    {o}
                  </button>
                ))}
              </div>
              <div style={{fontSize:9,color:"#9ca3af",textAlign:"right"}}>{filtered.length} de {pipeline.length} deals</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:440,overflowY:"auto",paddingRight:2}}>
                {filtered.map(s=><Card key={s.id} s={s} onSelect={setSelected} active={selected?.id===s.id}/>)}
              </div>
            </div>
            <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:16,padding:18,minHeight:400,overflowY:"auto"}}>
              {selected
                ?<Detail s={selected} threshold={threshold}/>
                :<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#6b7280",fontSize:13}}>
                    Selecciona una startup
                  </div>
              }
            </div>
          </div>
        )}

        {/* Métricas — full width */}
        {tab==="charts"&&(
          <div style={{overflowY:"auto"}}>
            <ChartsFullWidth pipeline={pipeline}/>
          </div>
        )}

        {/* Ajustes — centrado */}
        {tab==="settings"&&(
          <div style={{maxWidth:480,margin:"0 auto"}}>
            <Settings threshold={threshold} onSave={setThreshold}/>
          </div>
        )}
      </div>
    </div>
  );
}
