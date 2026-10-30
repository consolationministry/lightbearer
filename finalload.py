import json, urllib.request, urllib.error, time
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ueHFlaGhmemt1dXlhcnhoY3N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzMzMTMxMCwiZXhwIjoyMTA4OTA3MzEwfQ.lPwcJnfhNNaFlWk2BRk6QsHo5kyvDB8iAvvIVNRMTGE"
URL="https://onxqehhfzkuuyarxhcsz.supabase.co/rest/v1/"
def req(path, method="GET", body=None, prefs="return=representation"):
    r=urllib.request.Request(URL+path, method=method, data=json.dumps(body).encode() if body else None,
        headers={"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json","Prefer":prefs})
    try: return urllib.request.urlopen(r, timeout=120).read().decode()
    except urllib.error.HTTPError as e: return "ERR:"+str(e.code)+":"+e.read().decode()[:200]

W="/w/hosts/2/u/6ae1cfa7a692359019a719e5/workspace/"
yor=json.load(open(W+'yoruba_hymns.json'))
eng=json.load(open(W+'english_hymns.json'))
ROMAN={'i':1,'ii':2,'iii':3,'iv':4,'v':5,'vi':6,'vii':7,'viii':8,'ix':9,'x':10,'xi':11,'xii':12,'xiii':13,'xiv':14,'xv':15,'xvi':16,'xvii':17,'xviii':18,'xix':19,'xx':20,'xxi':21,'xxii':22,'xxiii':23,'xxiv':24,'xxv':25,'xxvi':26,'xxvii':27,'xxviii':28,'xxix':29,'xxx':30,'xxxi':31,'xxxii':32,'xxxiii':33,'xxxiv':34,'xxxv':35,'xxxvi':36,'xxxvii':37,'xxxviii':38,'xxxix':39,'xl':40}
def clean(a): return ['\n'.join(l for l in str(v).replace('\r\n','\n').split('\n') if l.strip()) for v in (a or [])]

rows={}
def add(h, lang):
    orig=h['number']; label=None
    if isinstance(orig,int):
        num=orig; label=str(orig).zfill(3)
    else:
        num=1990+ROMAN.get(str(orig).strip().lower(),0); label=str(orig).strip().lower()
    d=rows.setdefault(num, {"hymn_number":num,"title_en":"","title_yoruba":"","first_line_en":"","first_line_yoruba":"","verses_en":[],"verses_yoruba":[],"chorus_en":"","chorus_yoruba":"","source_number_label":label,"source_hymnal":"Uploaded Hymn Collection","status":"published"})
    vs=clean(h.get('verses') or []); ch=str(h.get('chorus') or '').replace('\r\n','\n')
    fl=vs[0].split('\n')[0].strip() if vs else ''
    if lang=='en':
        d.update({"title_en":h.get('title_en') or '',"first_line_en":fl,"verses_en":vs,"chorus_en":ch})
    else:
        d.update({"title_yoruba":h.get('title_yoruba') or '',"first_line_yoruba":fl,"verses_yoruba":vs,"chorus_yoruba":ch})
for h in eng: add(h,'en')
for h in yor: add(h,'yo')
for d in rows.values():
    if not d['verses_en'] and d['verses_yoruba']:
        d['source_hymnal']='Uploaded Yorùbá Hymn Collection'

allr=sorted(rows.values(), key=lambda r:r['hymn_number'])
print("rows to load:", len(allr), flush=True)
fail=0
for i in range(0,len(allr),50):
    res=req("hymns","POST",allr[i:i+50],"return=minimal")
    if res.startswith("ERR"):
        print("fail", i, res[:150], flush=True); fail+=1
        if fail>5: break
    else:
        print("loaded", min(i+50,len(allr)), flush=True)
    time.sleep(0.3)
total=req("hymns?select=hymn_number","GET",None)
print("TOTAL:", len(json.loads(total)) if not total.startswith("ERR") else "ERR", flush=True)
