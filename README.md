# Agrunio — çiftliğin dijital defteri

Küçük çiftlikler için mobil öncelikli hackathon prototipi. React + TypeScript + Vite ile hazırlanmıştır. Türkçe varsayılandır; üstteki **TR / EN** düğmeleriyle sunum için İngilizce seçilebilir. Dil tercihi bu tarayıcıda saklanır. Anahtarsız demo gerçek kullanıcı hesabı veya servis gerektirmez. İsteğe bağlı Gemini bağlantısı sunucudaki API anahtarını kullanır; Gemini çağrıları Google hesabınızın kota/faturalandırmasına tabidir. Font ve ikonlar yereldir.

Arayüz yetişkin çiftçiler için kompakt başlık, okunaklı DM Sans fontu, yaklaşık 16–18 px ana metin ve en az 48 px dokunma hedefleri kullanır. Zeytin yeşili, kiremit kırmızısı, buğday sarısı ve krem tonları hafif derinlik veren gölgelerle uygulanır. Bugünkü işler, açıklamalı stok açığı ve işlem girişi önceliklidir. Antigravity görselleri kullanılmaz.

## Kurulum ve çalıştırma

Node.js **22.12 veya üzeri** gerekir (alternatif: Node 20.19+).

Proje klasöründe terminal açıp çalıştırın:

```sh
npm install
npm run demo
```

Terminalde yazan yerel adresi açın: genellikle **http://127.0.0.1:5173**.

Kontroller ve üretim derlemesi:

```sh
npm test
npm run build
npm run preview
```

`npm run build`, TypeScript kontrolü yapar ve `dist/` klasörünü üretir. `npm run preview` derlenmiş uygulamayı yerelde açar; yayınlama yapmaz. `npm ci`, kilit dosyasındaki sürümlerle temiz kurulum için kullanılabilir.

Fiziksel telefonda aynı Wi-Fi üzerinden denemek isterseniz:

```sh
npm run dev -- --host 0.0.0.0
```

Terminaldeki ağ adresini telefonda açın. Bu HTTP komutu manuel kullanım içindir; kamera ve backend ile telefon testi için aşağıdaki **Telefonda kamera için yerel HTTPS** bölümünü kullanın. Uygulamayı yerel ağda erişilebilir yapar; internete yayınlamaz. Veriler tarayıcı ve origin başına ayrı saklanır; bilgisayar ile telefon otomatik eşitlenmez.

## İlk demo senaryosu

1. **Bugün** ekranında **Çiftlikte ne oldu?** alanına şunu yazın:

   `Kuzey tarlasında 600 kg gübre kullandım`

   **Desteklenen örnekleri göster** içindeki bir örneğe dokunarak da alanı doldurabilirsiniz.

2. **İşlemi incele** düğmesine basın. Tarla, iş, malzeme ve miktarı içeren düzenlenebilir taslak açılır. Henüz hiçbir kayıt değişmez.
3. Önizleme **800 kg → 200 kg** gösterir. Doğu işi **300 kg** gerektirdiğinden **100 kg** eksik kalacağı görünür. Bu rakamları uygulama kodu hesaplar.
4. **Kaynak kayıtları** içindeki İş, Stok ve Tarla düğmeleri gerçek detay sayfalarını açar. **İncelemeye devam et** ile taslağa dönülür.
5. **Onayla ve kaydet** ile Kuzey gübreleme işi tamamlanır, tüketim kaydı oluşturulur ve fiziksel stok **200 kg** olur.
6. **İşler → Tamamlandı** ve **Çiftliğim → Depo → Demo Gübre A** üzerinden sonucu inceleyin. Yenileme sonrası kayıtlar korunur. Aynı iş veya işlem tekrar onaylanırsa ikinci kez stok düşmez.
7. Kuzey ekim işi artık önkoşulunu karşılar. Ekim için malzeme girilmediği açıkça belirtilir; tamamlamak tohum tüketimi uydurmaz, miktarı bilinmeyen ayrı bir gerçekleşen iş kaydı oluşturur.
8. **Çiftliğim → Demo verilerini sıfırla** ile, ikinci bir onaydan sonra başlangıç verilerine dönülür.

Miktarı önizlemede değiştirebilir veya **Taslağı iptal et** ile işlemi iptal edebilirsiniz. Fiziksel stoktan fazla tüketim, sıfır/negatif/geçersiz miktar ve yanlış iş–tarla–malzeme eşleştirmeleri engellenir. Nokta veya virgül ile en fazla üç ondalık basamak kabul edilir; binlik ayırıcı kullanmayın.

## Anahtarsız yerel yorumlayıcı (fallback)

Anahtar yoksa, backend kapalıysa veya API cevabı doğrulanamazsa ekranda açıkça **“Demo yorumlayıcı — gerçek AI bağlı değil”** yazısı bulunur. İngilizce seçilirse **“Demo interpreter — no real AI connected”** gösterilir. Yorumlayıcı sadece dar bir yerel metin kalıbını tanır. Gerçek AI gibi serbest cevap üretmez.

Desteklenen örnekler:

```text
Kuzey tarlasında 600 kg gübre kullandım
Doğu tarlasında 200 kg gübre kullandım
I used 600 kg fertilizer in Kuzey
600 kg gübre kullandım
Kuzey tarlasında gübre kullandım
Kuzey ve Doğu tarlalarında 600 kg gübre kullandım
```

Son üç örnekte eksik veya belirsiz alanlar kullanıcı seçimini gerektirir. Bir tarlada birden fazla uygun iş varsa yorumlayıcı rastgele iş seçmez. Tanınmayan veya olumsuz ifadelerde sonuç uydurulmaz; desteklenen örnekler gösterilir. Tamamlanmış işler yeni tüketim için seçilemez.

## Çalışan kapsam

- Bugün, İşler, Çiftliğim navigasyonu; mobil alt menü ve bilgisayarda yan menü.
- Türkçe / İngilizce arayüz, kayıt adları ve hata mesajları; dil değişimi kayıtları ve kullanıcı iş adlarını değiştirmez.
- Tarla, malzeme, depo, makine, ekip listeleri ve bağlantılı detaylar.
- Planlanan/tamamlanan işler ve önkoşula bağlı ekim işi.
- Yeni gübreleme işi planlama: tarla, kişi, makine, malzeme, miktar ve isteğe bağlı önkoşul. Planlama fiziksel stoktan düşmez.
- Düzenlenebilir işlem taslağı, hesaplanan önizleme, stok açığı ve açık kullanıcı onayı.
- Tüketim defteri, localStorage kalıcılığı, tekrar kayıt koruması ve demo sıfırlama.
- Geçersiz kayıt, depolama hatası, eksik bilgi, tanınmayan ifade ve boş listeler için açıklamalar.
- Destekleyen tarayıcılarda Web Locks ile aynı origin içindeki sekmelerin yazmalarını sıraya koyma; her işlemde güncel veriyi yeniden okuma ve sürüm kontrolü.

## Hayalî örnek çiftlik

Murat Demir (sahip), Ali Kaya (çalışan), Ece Demir (stok sorumlusu). Kuzey 30 dekar/buğday planı; Güney 35 dekar/mısır; Doğu 25 dekar/arpa planı. Kırmızı traktör, gübre serpme makinesi, ekim makinesi ve römork. Ana depo, bakım deposu ve ana depoda **800 kg Demo Gübre A**. Kuzey gübreleme planı **600 kg**, Doğu planı **300 kg**, ikisi de Ali ve aynı traktör/serpme makinesi ile ilişkili. Kuzey ekimi, Kuzey gübrelemesinin tamamlanmasını bekler.

**Bütün isimler, stoklar ve miktarlar tamamen hayalî demo verileridir. Bunlar tarımsal doz önerileri değildir.**

## Dosya yapısı

```text
src/
  App.tsx                         Ekranlar, navigasyon ve formlar
  scanning/                       Kod kataloğu, QR/EAN çözücü ve kamera oturumu
  components/ProductScanner.tsx   Kamera, manuel giriş ve ürün seçimi
  components/DemoLabels.tsx       İndirilebilir demo QR/EAN etiketleri
  scanning.css                    Tarama ve etiket mobil düzeni
  styles.css                      Mobil/masaüstü görünüm
  operations.css                  Yetişkinlere uygun görsel sistem ve mobil düzen
  i18n/tr.json                     Türkçe arayüz ve mesajlar
  i18n/en.json                     İngilizce arayüz ve mesajlar
  i18n/messages.ts                 Kayıtları değiştirmeden metin yerelleştirme
  i18n/messages.test.ts            Dil ve veri koruma testleri
  components/Dialog.tsx            Erişilebilir native dialog
  components/DecisionImpacts.tsx   Ortak karar zinciri ve kanıt bağlantıları
  components/ActionReview.tsx      Ortak düzenleme ve onay formu
  domain/types.ts                  Kayıt ve taslak tipleri
  domain/demo.ts                   Başlangıç demo verileri
  domain/actions.ts                Ortak taslak doğrulama, önizleme ve atomik commit
  domain/impacts.ts                Saf öneri projeksiyonu ve genel etki motoru
  domain/impacts.test.ts           Etki zinciri, yeni taslaklar ve idempotency testleri
  domain/drafts.ts                 Ekran eylemleri için ActionDraft üretimi
  domain/schedule.ts               Yerel takvimde sonraki pazartesi
  domain/operations.ts             Mevcut formları ActionDraft yapısına dönüştürme
  domain/selectors.ts              Merkezi hesaplar ve liste ekranı görünüm verisi
  domain/validation.ts             Model, ilişki ve defter tutarlılığı kontrolü
  domain/repository.ts             Okuma, onay, kalıcılık ve sıfırlama
  domain/browserRepository.ts      Tek localStorage adaptörü ve dil tercihi
  domain/storage.ts                Versiyonlu saklama ve güvenli geçiş
  domain/migration.ts              Eski v1 verisini v2 domain kayıtlarına taşıma
  domain/legacy.ts                 Yalnızca eski şema doğrulaması
  domain/legacyDemo.ts             Eski şemalı test örneği
  domain/operations.test.ts        Senaryo ve hata testleri
  domain/actions.test.ts           Ortak işlem, etkiler ve repository testleri
  hooks/useFarm.ts                 Repository aboneliği ve React adaptörü
  interpreter/demoInterpreter.ts   Değiştirilebilir yorumlayıcı arayüzü
```

## Domain mimarisi

Asıl veri, sürüm 2 `FarmState` içinde saklanır. Her kaydın sabit `id` alanı vardır; varlıklar `farmId` ile çiftliğe, birbirlerine ilgili kayıt kimlikleriyle bağlanır. Adlar ve yerelleştirilmiş metinler bağlantı anahtarı değildir.

| Varlık                     | Sorumluluğu                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| Farm, Field, Person, Asset | Çiftlik, tarlalar, kişiler, makineler ve kullanılabilirlik         |
| StorageLocation, Product   | Depo konumu ve konumdan bağımsız ürün tanımı                       |
| InventoryBalance           | Bir ürünün belirli konumdaki fiziksel miktarı                      |
| InventoryTransaction       | Fiziksel stok hareketi; tüketim, giriş, düzeltme veya iade türü    |
| Task                       | Planlanan miktar, kişi, makineler, önkoşul ve tarih/saat bilgisi   |
| OperationRecord            | Gerçekleşen miktar ve kaynaklar; planı değiştirmeyen ayrı iş kaydı |
| DocumentSource             | Doğrulanmış kaynak tipi; demo verilerinde belge yok                |
| ActivityLogEntry           | İşlemi yapan kişi, değişen kayıt kimlikleri ve zaman               |
| ServiceOffer               | Göreve ait hayalî hizmet alternatifi, kayıtlı fiyat/nakliye/süre   |
| ActionDraft, Impact        | Onay bekleyen öneri ve kayıtlardan hesaplanan etkileri             |

Plan ve gerçekleşen miktar ayrı alanlardır. Bilinmeyen miktar, tarih ve saat `null` olur. Bilinen ihtiyaçların alt toplamı ayrıca hesaplanır; eksik miktarlar varsa toplam ihtiyaç ve kapsama durumu “bilinmiyor” kalır. Ekimde hayalî sıfır tüketim oluşturulmaz.

Akış: **ActionDraft → doğrulama/eksik seçimler → impact preview → açık confirmation → commit**. `previewAction` ve `calculateImpacts` saf fonksiyonlardır; kayıt değiştirmezler. `commitAction`, onaylanan taslağı güncel revision ile doğrular; balance, Task, InventoryTransaction, OperationRecord ve ActivityLogEntry değişikliklerini tek yeni state olarak üretir. Plan oluşturma, makine durumu ve tarih değişimi yalnızca ilgili kayıtları ve geçmişi değiştirir; fiziksel tüketim oluşturmaz.

`FarmRepository.confirm` en güncel saklanan veriyi yeniden okur ve bu state'i tek `setItem` ile kaydeder; yazma başarılı olmadan React'e yeni state yayımlanmaz. Aynı taslak kimliği, completion kimliği veya tamamlanmış görev yeniden işlendiğinde stok tekrar düşmez. İptal edilen taslağın kayıt katmanına gönderilmesi gerekmez. Sıfırlama, mevcut ayrı onay penceresinden repository üzerinden yeni demo state'i yazar.

Etki motoru kalan stok, diğer planların ihtiyacı/açığı, ortak kişi/makine saat çakışmaları, eksik önkoşul, kullanılamayan makineye bağlı planlar ve tarih değişikliğinden etkilenen görevleri hesaplar. `confirmed` kayıtlarla hesaplanmış bilgi, `warning` dikkat gerektiren durum, `unknown` veri eksikliği demektir. Aynı kişinin adı veya “Bugün” etiketi saat çakışmasını kanıtlamaz. Yeni demo başlangıcında Doğu gübreleme için sonraki pazartesi 09:00–11:00 aralığı kayıtlıdır. Kuzey gübreleme ve Kuzey ekim saatleri bilinmiyor; motor bunları açıkça bildirir. Motor tarımsal sonuç, verim veya doz önermez.

Kalıcı anahtar **fieldnote.demo.v2**'dir. Geçerli **fieldnote.demo.v1** verisi otomatik taşınır; eski anahtar kurtarma kopyası olarak korunur. Özel iş adları, kimlikler, stok miktarı ve önceki tamamlamalar korunur. Geçiş veya kayıt okuma başarısızsa açıklamalı, yazmaya kapalı demo açılır; eski veri sessizce silinmez. Kullanıcı onaylı demo sıfırlaması v2'yi baştan oluşturur.

Mevcut ekranlar `selectFarmView` üzerinden aynı merkezi kayıtların görünüm kopyalarını okur; bu kopyalar saklanmaz. Gelecek harita, depo binası veya karakter de kayıt `id`'siyle aynı selector/detail route'u açabilir ve aynı ActionDraft hattını kullanabilir. İsteğe bağlı `presentation.iconKey`, `scenePosition`, `visualState` yalnızca görüntü içindir; etki ve stok kuralları bunlara bakmaz. Bu sürümde oyun haritası eklenmedi.

Gemini adaptörü yalnızca şemaya uygun çıkarım önerir; uygulama bunu ActionDraft biçimine dönüştürür. `isActionDraft`, `previewAction` ve kullanıcı seçimi/onayı üzerinden mevcut hat kullanılır; yorumlayıcının localStorage veya repository yazma yetkisi yoktur. Üretim veritabanı eklenince aynı domain kuralları sunucuda da çalıştırılmalıdır; API anahtarı zaten yalnızca sunucuda kalır.

## Kararın etkileri demosu

Üç demo aynı `ActionDraft → previewAction → calculateImpacts → DecisionImpacts → confirmation → commitAction → repository` hattını kullanır. Taslak üreticileri ve yorumlayıcı yalnızca öneri oluşturur; React bileşenleri stok/çakışma hesabı veya localStorage yazması yapmaz. `projectDraft` saf bir varsayımsal görünüm üretir; bu görünüm kalıcı kayıt değildir.

**Önerilen sunum sırası A → C → B** (tüketim Kuzey işini tamamladığı için tarih değişikliğini önce gösterin):

1. Eski demo kayıtlarınız varsa **Çiftliğim → Demo verilerini sıfırla → Demo verilerini sıfırla** ile yeni hayalî takvimi/teklifleri yükleyin. Önceki v2 kayıtları kendiliğinden değiştirilmez; sıfırlama yalnızca açık onayla yapılır.
2. **A:** **Çiftliğim → Makineler → Kırmızı traktör → Arıza bildir**. Mevcut/yeni durum, traktörü gerçekten kullanan üç plan ve Kuzey gübreleme → Kuzey ekim bağı görünür. Bir düğüme dokunup **Neden etkilendi? / Kanıt kayıtları** bölümünü açın. Tamir zamanı bilinmiyor kalır. **Taslağı iptal et** hiçbir kayıt değiştirmez; **Onayla ve kaydet** yalnızca makine durumunu ve geçmişini değiştirir. Makine detayındaki etkiler güncel merkezi kayıtlardan yeniden hesaplanır.
3. **C:** **İşler → Kuzey gübreleme → Pazartesiye taşımayı dene**. Saatler boşken onay devre dışıdır. **09:30–10:30** girince Doğu gübrelemenin kayıtlı 09:00–11:00 aralığı nedeniyle **Ali, kırmızı traktör ve serpme makinesi** çakışması kanıtlarıyla görünür. **11:00–12:00** aralığı Doğu ile çakışmaz (bitiş/başlangıç sınırları çakışma sayılmaz). Kuzey ekim tarihi bilinmediği için sıralama doğrulanamaz. **Onayla ve kaydet** sadece Kuzey'in takvimini ve geçmişini değiştirir; miktar ve bağlı görev tarihleri değişmez.
4. **B:** **Bugün → Çiftlikte ne oldu?** alanına `Kuzey tarlasında 600 kg gübre kullandım` yazıp **İşlemi incele**. **800 − 600 = 200 kg**, Doğu ihtiyacı **300 kg** ve bilinen açık **100 kg**, aynı karar zincirinde stok ve görev bağlantılarıyla gösterilir. **Onayla ve kaydet** tek tüketim, tek gerçekleşen iş, tek geçmiş kaydı oluşturur; yeniden onay ikinci kez stok düşürmez. Arızalı bir makine hâlâ kayıtlıysa uyarı görünür; geçmişte gerçekleştiği bildirilen iş otomatik olarak uydurulmaz/iptal edilmez.

Diğer eylemler de ortaktır: kişi detayından **Durumu değiştir**; iş detayından **İş planını değiştir** ile kişi, makineler, planlanan ürün/miktar, tamamlama, tamamlanamama veya hizmet alternatifi seçimi; stok detayından **Fiziksel sayımı düzelt**. Tamamlanamayan iş planlanan kalır; nedeni, `outcome: notCompleted` gerçekleşen deneme ve geçmiş kaydı tutulur. Daha sonra tamamlanabilir. Tüketim bilgisi olmadan iş tamamlama, miktarı `null` olan bir gerçekleşen iş oluşturur; stok hareketi oluşturmaz.

`ServiceOffer` kayıtları hayalîdir: Hizmet A 1800 TRY + 200 TRY nakliye = **2000 TRY**; Hizmet B 1500 TRY ancak nakliye/süre bilinmiyor, toplamı doğrulanamıyor. Görev düzenlemesinde alternatif teklif bağlanabilir; kişi ve makineler kendiliğinden değiştirilmez. Demo gübresinin fiyatı girilmediğinden maliyeti bilinmiyor. Birim fiyat kayıtlıysa motor gerçek kayıtlı fiyat × miktar hesabını yapar; fiyat yoksa sıfır varsaymaz. Stok ortak fiziksel miktardır; görevler arasında rezervasyon/dağıtım yapılmaz. Her işin tek başına yeterliliği ve bütün işlerin toplam açığı ayrı gösterilir.

`Impact` kaynak/etkilenen varlık türü ve kimliğini, ilişkiyi, `severity`, `certainty`, sade neden, `evidenceRefs`, gerekli soru, önerilen değişiklik ve bağımlılık seviyesini taşır. Eski `classification`, `kind`, `messageKey`, `values`, `records` alanları mevcut tüketim ve test uyumu için korunur. Kanıtlar kimliklerle görev, ürün, stok, depo, makine, kişi veya teklif detayını açar. Motor yalnızca kayıtlı dependency bağlantılarını (çok adımlı zincir dahil), ortak kişi/makine aralıklarını, fiziksel stok ve planlanan ihtiyaçları kullanır. Sunucu/model de aynı taslak şemasını kullanabilir; etki hesabı ve onay yerel modelden bağımsızdır.

Görsel bileşen React/CSS ve mevcut Lucide ikonlarıyla yapıldı. React Flow'nun düğüm sürükleme, zoom/pan ve editör altyapısı bu dikey, salt okunur mobil zincir için gerekmiyor; ek paket eklenmedi. Düğümler ve seviye yerleşimi motor çıktısından üretilir, senaryo sonuçları sabit yazılmaz. Kısa giriş animasyonu `prefers-reduced-motion` ile kapanır. Gelecek harita/bina/karakter arayüzü aynı kayıt kimlikleri, taslak fabrikası ve etki bileşenini kullanabilir; bu sürümde harita yapılmadı.

Saklama sürümü/anahtarı v2 kalır. Kişi müsaitliği, onarım zamanı, fiyat, hizmet alternatifleri ve başarısız deneme alanları geriye uyumlu isteğe bağlıdır; eski v2 verisi korunur. Eksik yeni alanlar bilinmiyor kabul edilir. Yeni teklifler/takvim yalnızca yeni demo veya onaylı sıfırlamada eklenir. Eski v1 migration ve bozuk kaydı koruyan hata akışı değişmedi.

## Sürümün sınırları

- Tek çiftlik, tek demo kullanıcı. Yerel AI sunucusu vardır; gerçek giriş ve ekip yetkilendirmesi henüz yoktur. API yalnızca 127.0.0.1 üzerinde dinler; üretim dağıtımı için yetkilendirme ve istek sınırı gerekir.
- Tarla, ürün, depo, kişi ve makine ekleme ekranı yoktur. Mevcut örneklerin müsaitliği, iş atamaları, planlanan miktar, hizmet alternatifi ve fiziksel stok sayımı onayla değiştirilebilir. Stok girişi/iadesi sonraki aşamadır.
- Gemini adaptörü ve iki sentetik belge üzerinde metin araması vardır; sensör, hava durumu, bildirim servisi, embedding veya harici vektör veritabanı yoktur.
- Gerçek belge yükleme ve belge doğrulama iş akışı henüz bağlı değildir. Yalnızca açıkça hayalî iki demo kaynak kullanılır. Gerçek etiket, doz, teşhis veya güvenli kullanım tavsiyesi üretilmez.
- Dar yorumlayıcı tüm Türkçe/İngilizce cümleleri anlayamaz. Yalnızca belgelenen kalıplar desteklenir.
- Kısmi bir miktarın onaylanması işi tamamlar; iş başına bir tüketim kaydı vardır. Çok aşamalı tüketim ve gerçekleşen tüketimi geri alma/iptal sonraki aşamadır.
- Ekimde tohum bilgisi yoktur; ekim tamamlama miktarı bilinmeyen gerçekleşen iş ve geçmiş kaydı oluşturur. Tarla ürün aşaması otomatik güncellenmez.
- Takvim aralıkları çiftliğin yerel saatidir; gece yarısını aşan işler, saat dilimi dönüşümü ve tekrar eden görevler desteklenmez. Eksik saatle kesin çakışma üretilmez; tarih değiştirme başlangıç/bitiş saati gerektirir.
- Stok düzeltmesi fiziksel sayım formuyla onaylanır; sıfır sayım geçerlidir. Bilinmeyen başlangıç stoğu için mutabakat/giriş akışı henüz yoktur. Giriş/iade hareketleri için ekran ve ActionDraft türü sonraki aşamadır.
- ActivityLogEntry ve DocumentSource modelleri hazırdır; ayrı genel geçmiş ekranı ve belge doğrulama/bağlama akışı henüz yoktur.
- Veriler yalnızca bu tarayıcının localStorage alanındadır. Tarayıcı verileri silinirse kayıtlar kaybolur; merkezi yedek veya cihazlar arası eşitleme yoktur. Bozuk kayıtlar sessizce üzerine yazılmaz, sıfırlama istenir.
- Aynı anda çok kullanıcılı kullanım için sunucu tarafı transaction gerekir. Web Locks desteklemeyen tarayıcılarda sekmeler arası yarışlara karşı tam garanti verilmez.
- Taslak henüz onaylanmadığı için yalnızca sayfa içinde tutulur; sayfa yenilenirse taslak silinir, onaylanmış kayıtlar kalır.
- PWA/offline kurulum ve service worker yoktur. Kurulumdan sonra uygulama servis veya anahtar gerektirmez, ancak yerel geliştirme/preview sunucusu açık olmalıdır.

## Gemini bağlantısı ve belge araması

Gemini Developer API için resmi [`@google/genai` SDK](https://googleapis.github.io/js-genai/) ve `gemini-3.1-flash-lite` modeli kullanılır. Yanıtlar JSON Schema ile istenir ve Zod ile hem sunucuda hem istemcide doğrulanır. Geçersiz JSON, bilinmeyen kayıt/kanıt kimliği ve desteklenmeyen belge iddiaları reddedilir.

### Anahtar ve çalıştırma

Proje kökünde `.env.example` dosyasını `.env` olarak kopyalayın:

```sh
cp .env.example .env
```

`.env` içindeki `your_key_here` yerine kendi Gemini Developer API anahtarınızı yazın:

```dotenv
GEMINI_API_KEY=your_key_here
```

Anahtarı buradaki sunucu ortam değişkenine yazın; `VITE_*`, tarayıcı kodu veya localStorage kullanmayın. `.env` Git tarafından yok sayılır; `.env.example` yalnızca yer tutucu içerir. Anahtar `.env` değiştirildiğinde backend'i yeniden başlatın. Anahtar Google AI Studio'dan alınır; model erişimi/kota hesabınıza bağlıdır.

İki sunucuyu tek komutla başlatın:

```sh
npm run demo
```

Frontend: `http://127.0.0.1:5173` (doluysa Vite sonraki portu kullanır). Backend: `http://127.0.0.1:3001`. Önceden çalışan Vite varsa yeni `npm run demo` terminalindeki adresi kullanın veya önce eski geliştirme sürecini durdurun.

Ayrı terminaller kullanmak isterseniz:

```sh
# Terminal 1
npm run server
# Terminal 2
npm run dev
```

Vite `/api` isteklerini yerel backend'e yönlendirir. `npm run preview` de aynı proxy'yi kullanır ve backend ayrıca açık olmalıdır. `npm run build` frontend ve backend TypeScript kodunu kontrol eder; Vite yalnızca istemciyi `dist/` içine derler. Sunucu `tsx server/index.ts` ile çalışır.

Anahtar yoksa veya yer tutucu değiştirilmemişse **Demo yorumlayıcı — gerçek AI bağlı değil** kullanılır. Backend/API hatası ve geçersiz çıktı kullanıcıya genel bir mesajla açıklanır; SDK hatası veya anahtar istemciye/loga döndürülmez. Kaynak kartları ve doğrulanmış yerel belge araması anahtarsız da çalışır ve **AI cevabı değildir** diye etiketlenir. Başarılı Gemini cevabından sonra **Gemini destekli yorumlama** gösterilir; yalnızca anahtarın varlığı bağlantı başarısı sayılmaz.

### Deneme

**Bugün → Çiftlikte ne oldu?** alanında anahtar ile şu ifadeleri deneyin:

- “Kuzey tarlasında 600 kilo gübre kullandık.” / “Kuzeye 600 kg gübre attık.”
- “Ali kuzeyde 12 çuval gübre kullandı.” (AI 12 çuvalı çıkarır; uygulama doğrulanmış 50 kg ambalaj kaydıyla 600 kg hesaplar ve kaynağı gösterir.)
- “Kırmızı traktör bozuldu.” / “Traktörü kullanım dışı yap.”
- “Kuzey gübrelemeyi pazartesiye al.” / “Kuzeydeki işi pazartesi sabahına taşı.” (belirsiz görev/saat seçilir; sabah için saat uydurulmaz.)

Düzenlenebilir taslak ve mevcut **Kararın etkileri** gösterilir. Eksik alanlar ve belirsizlikler kullanıcı tarafından giderilir. **Onayla ve kaydet** öncesinde hiçbir kayıt değişmez. 600 kg için uygulama hesabı 800→200 kg ve Doğu'nun 300 kg ihtiyacına karşı 100 kg açık gösterir. Mevcut idempotency, transaction ve audit davranışı aynen korunmuştur. Anahtarsız fallback yalnızca yukarıdaki dar yorumlayıcı kalıplarını anlar; Gemini'nin serbest dil anlayışını taklit etmez.

**Bugün → Belge desteği** veya **Çiftliğim → Belge desteği** üzerinden demo ürünü açın; ürün detayındaki **Belgeye sor** alanını kullanın. Ana girişte de belge sorulabilir:

- “Demo Gübre A’dan bir çuval kaç kilo?” → kaynaklı 50 kg bilgisi.
- “Bu gübreyi dekara kaç kilo uygulamalıyım?” → bilgi bulunamadı; 600 kg planın hayalî, önceden girilmiş miktar olduğu açıklanır.
- “Demo İlaç B uygulamasından sonra ne zaman hasat edebilirim?” → sentetik 10×24 saat kaynağı; önce uygulama tarihi **ve saati** istenir. Süreyi uygulama kodu tam 240 saat ekleyerek hesaplar; gerçek ilaçlara uygulanmaz.

**Kaynağı göster** kartları `sourceId / sectionId` ve orijinal Türkçe bölüm metnini açar. UI TR/EN değişebilir, kaynak metni özgün hâliyle kalır.

### Mimari ve sınırlar

- `server/index.ts`: yerel Node HTTP sunucusu, server-only `.env`, JSON boyut sınırı, aynı yerel origin kontrolü; `GET /api/status` ve `POST /api/interpret`.
- `server/provider.ts`: `AIProvider` arayüzü ve Gemini adaptörü. Testler mock provider kullanır; gerçek Gemini/dış ağ çağrısı yapmaz.
- `server/service.ts`: istek/yanıt doğrulama, gerekli belge parçalarını seçme, güvenli hata/fallback. Repository veya commit erişimi yoktur.
- `src/ai/schema.ts`: sıkı istek/model/istemci cevap şemaları; yalnızca bu çiftliğin planlanan görevleri, alanları, kişiler, makineler, ürünler ve stoktan gerekli alanları seçer. İşlem/geçmiş kayıtları ve saklanan tüm state gönderilmez.
- `src/ai/adaptDraft.ts`: AI çıkarımını mevcut `ActionDraft` biçimine saf olarak dönüştürür. Kimlikleri uygulama üretir; çuval dönüşümünü doğrulanmış kaynakla uygulama hesaplar.
- `src/ai/documents.ts`: kimlikli, salt okunur demo kaynak kataloğu ve küçük metin araması. Mevcut v2 localStorage verisini değiştirmez veya sıfırlamaz. Demo İlaç B yalnızca belge kataloğundadır; fiziksel stok veya gerçekleşmiş uygulama kaydı uydurulmaz.
- `src/ai/answers.ts`: kaynak kimliği, seçilmiş bölüm ve desteklenen gerçek kontrolü; cevap metnini yalnızca doğrulanmış demo bilgilerinden üretir. Modelin serbest metnine, aritmetiğine veya başka ürün için bildiği bilgilere güvenilmez. Bilinmeyen soru için cevap uydurulmaz.
- `src/components/DocumentQuestion.tsx`, `AIReviewNote.tsx`: yükleniyor, fallback, eksik bilgi, AI atfı, kaynağı açma ve tarih sorusu. `ActionReview` / `DecisionImpacts` mevcut önizleme ve onayı kullanır. Etki motoru değiştirilmemiştir.

**ActionDraft → validation → impact preview → kullanıcı confirmation → repository commit** zinciri aynı kalır. AI hiçbir kaydı değiştiremez; bu sürümde domain ve localStorage hâlâ tarayıcıdadır. Gelecek harita/bina/karakter ekranları aynı domain kimlikleri, taslak ve onay hattını kullanabilir.

Belge içeriği ve kullanıcı metni sistem talimatı değildir: sunucunun prompt'u bunu açıkça sınırlar. Sıkı şema, yalnızca önceden seçilen kaynak kimlikleri ve uygulamanın doğrulanmış cevap üretimi belge içindeki talimatlardan bağımsızdır. AI'nın tarım/doz, stok veya maliyet sonucu uygulama hesabı gibi gösterilmez. Stok/iş/kişi/makine/teklif kanıtları mevcut merkezi kayıtları açar; teklif metni yükleme ve “nakliye hariç” gibi alıntıları gerçek belgeye bağlama henüz uygulanmadı.

Model adaptörü şu üç olay türünü destekler: tüketim, makine müsaitliği ve görev tarihi. Diğer domain eylemleri mevcut elle düzenleme ekranlarında çalışır; AI desteği sonraki aşamadır. Gerçek PDF/etiket yükleme, gerçek belge doğrulama, kapsamlı arama, hesap yetkilendirmesi ve üretim sunucusu bu sürüme dahil değildir. Üretimde kimlik doğrulama, sunucu tarafı yetki/doğrulama, kalıcı veritabanı ve rate limiting eklenmelidir.

## Bu değişikliğin kontrol sonucu

`npm test`: **123/123 test geçti**; önceki 97 test korundu, 26 yeni test eklendi. `npm run build`: frontend ve backend TypeScript kontrolü ile Vite üretim derlemesi başarılı. Zod paketinin iki yorum anotasyonu için zararsız Rollup uyarısı var.

Anahtar olmadan gerçek yerel HTTP endpoint test edildi: `/api/status` yapılandırılmadı, `/api/interpret` `demo/no_key` döndü. Mobil tarayıcıda 320 px ve 390 px genişlikte yatay taşma görülmedi. 600 kg taslakta 800→200 kg ve 100 kg açık, onay sonrası 200 kg stok, yenilemede kalıcılık, tek girişten kaynaklı çuval cevabı, kaynak bölümünü açma, belgede olmayan doz cevabı, sentetik ilaçta tarih/saat sorusu ve 10 gün hesabı, ürün detayına erişim ve TR/EN kontrol edildi. Kontrol için ayrı 5175 origin kullanıldı; mevcut 5173 verileri değiştirilmedi.

İlk kontroller anahtarsız yapıldı. Daha sonra başlatılan canlı Gemini testi kullanıcı tarafından durduruldu ve henüz tamamlanmadı. Model erişimi ve iki senaryonun gerçek API üzerinden çalışması başarılı veya tamamlanmış sayılmamalıdır. SDK/model/prompt ve JSON sınırları mock provider ile doğrulandı; bütün otomatik testler dış ağ kullanmadan çalıştı. `.env`, `node_modules` ve `dist` ignore kontrolü yapıldı; istemci bundle içinde SDK/API adresi/anahtar değişkeni bulunmadı. Bu checkpoint canlı API başarısı iddiası taşımaz; canlı Gemini doğrulaması ayrıca tamamlanmalıdır.

## Checkpoint sonrası canlı Gemini kontrolü — 2026-10-04

Önceki checkpoint sırasında durdurulan canlı test bu yerel çalışmada tamamlandı. `npm run demo` ile sunucu yeniden başlatıldı. Anahtar yalnızca sunucu tarafındaki `.env` üzerinden okundu; anahtar çıktıya, istemciye veya Git'e aktarılmadı. Mevcut sunucu kodunun yapılandırdığı `gemini-3.1-flash-lite` kimliği gerçek Developer API `models.get` çağrısıyla doğrulandı; model kimliği tahmin edilmedi.

Temiz demo için ayrı `http://127.0.0.1:5176` origin'i ve bellek içindeki `createDemoState()` kullanıldı. Mevcut 5173 kullanıcı kayıtlarına müdahale edilmedi. Üç senaryo da gerçek `provider: gemini` cevabıyla ve tarayıcıdaki **Gemini destekli yorumlama** etiketiyle kontrol edildi; demo fallback canlı başarı sayılmadı:

1. **Ali kuzeyde 12 çuval gübre kullandı.** → AI 12 çuvalı çıkardı; uygulama doğrulanmış `doc-fertilizer-a / packaging` kaydındaki 50 kg/çuval ile **600 kg** taslak hesapladı. Mevcut etki motorunun önizlemesi **800 → 200 kg** ve Doğu'nun 300 kg ihtiyacı için **100 kg açık** gösterdi. Taslak onaylanmadı.
2. **Bu gübreyi dekara kaç kilo uygulamalıyım?** → belgede doz bulunmadığı açıkça gösterildi; `unavailable` sonucu ve `doc-fertilizer-a / unrecorded` kaynağı kullanıldı. Doz üretilmedi; 600 kg planın önceden girilmiş hayalî miktar olduğu açıklandı.
3. **Demo Gübre A’dan bir çuval kaç kilo?** → **50 kg** cevabı ve `doc-fertilizer-a / packaging` kaynağı gösterildi; kaynak kartından orijinal bölüm açıldı.

Canlı kontrolde modelin tüketim formunda bulunmayan tarih/saat alanlarını istemesi görüldü. Yalnızca `server/provider.ts` sistem talimatı netleştirildi: bu sorular tarih değiştirme eylemine aittir; tüketim taslağında istenmez. Özetin kaydedilmiş işlem yerine onaylanmamış taslağı anlatması istendi. Düzeltmeden sonra tüketim senaryosu gerçek API ile tekrar geçti. Arayüz, etki motoru ve onay hattı değiştirilmedi; QR/OCR eklenmedi.

Son fiziksel stok **800 kg**, tüketim kaydı **yok**, Kuzey ve Doğu işleri **planlandı** olarak kaldı. API hata kodu oluşmadı. Düzeltme sonrası `npm run build` başarılı ve `npm test` **123/123** geçti. Otomatik testler yine mock provider kullanır; canlı çağrılar otomatik testlere eklenmedi. Bu yerel kontrolün ardından push yapılmadı.

## QR / barkod → ürün → belgeye sor

**Bugün**, **Çiftliğim** veya **Depo** ekranındaki **QR / barkod ile ürün bul** düğmesini kullanın. Doğrudan adres: `/#/scan`.

- **Tara** düğmesine basılana kadar kamera izni istenmez. Yalnızca video alınır; ses, fotoğraf kaydı ve görüntü yükleme yoktur. QR ve EAN-13 okunur; arka kamera tercih edilir.
- İlk kodda tarama durur. Ekrandan çıkınca, sekme gizlenince veya **Kamerayı kapat** seçilince track'ler kapatılır. Geç gelen izin/decoder sonuçları ve tekrar okuma aynı oturumda yeniden işlenmez.
- İzin reddi, kamera yokluğu/meşgul oluşu, desteklenmeyen tarayıcı ve HTTPS gereksinimi açıklamalı mesajlarla gösterilir. **Kodu elle gir** her zaman kullanılabilir; kamerayla aynı kod eşleştirme fonksiyonunu kullanır.
- Bilinen kod mevcut ürün detayını açar: fiziksel stok bağlantısı, bağlı belge bölümleri ve mevcut **Belgeye sor**. Demo İlaç B'nin fiziksel stok kaydı yoktur; miktarı bilinmiyor olarak gösterilir, sıfır uydurulmaz.
- Bilinmeyen kod **Ürün bulunamadı** gösterir. **Katalogdan elle ürün seç → Seçilen ürünü aç** ile mevcut bir ürün seçilebilir. Yeni ürün/belge oluşturulmaz. QR içeriğindeki URL açılmaz veya sunucudan indirilmez.
- Kod yalnızca ürün kimliğini bulur; bilgi bağlı doğrulanmış **hayalî demo belgesinden** gelir. Tarama, ürün seçimi ve belge sorusu stok değiştirmez. AI, etki motoru ve kullanıcı onayı hattı korunmuştur.

### Sunum etiketleri

Tarama ekranından **Demo etiketleri** düğmesine basın veya `/#/demo-labels` adresini başka bir ekranda açın. QR görselleri indirilebilir; sayfa tarayıcının yazdır komutuyla yazdırılabilir. Etiketlerde QR ve EAN-13 görselleri bulunur.

| Hayalî ürün  | QR içeriği                  | Hayalî EAN-13 test kodu |
| ------------ | --------------------------- | ----------------------- |
| Demo Gübre A | `AGRUNIO:DEMO:FERTILIZER-A` | `2000000000015`         |
| Demo İlaç B  | `AGRUNIO:DEMO:PESTICIDE-B`  | `2000000000022`         |

Bunlar gerçek ürün etiketi veya kayıtlı ticari barkod değildir. `public/demo/` SVG dosyaları yerel ve sabittir. `npm run labels`, `src/scanning/catalog.ts` içindeki kodlardan görselleri tekrar üretir; kamera veya API anahtarı kullanmaz.

### Telefonda kamera için yerel HTTPS

Bilgisayardaki localhost kamera için güvenli bağlam kabul edilir. Telefonda bilgisayarın `http://192.168...` adresi güvenli bağlam değildir; manuel giriş çalışır fakat kamera için **telefonun güvendiği sertifikayla HTTPS** gerekir. [Kamera API'sinin güvenli bağlam gereksinimi](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

İsteğe bağlı yerel TLS desteği vardır; otomatik deployment veya tünel açılmaz. Mac'te Homebrew varsa [mkcert'in resmi talimatları](https://github.com/FiloSottile/mkcert#mobile-devices) ile geliştirme sertifikası oluşturabilirsiniz:

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
# 192.168.1.20 yerine bilgisayarınızın Wi-Fi IP adresini yazın.
mkcert -cert-file .certs/agrunio-cert.pem -key-file .certs/agrunio-key.pem localhost 127.0.0.1 192.168.1.20
```

`mkcert -CAROOT` ile gösterilen klasördeki **rootCA.pem** sertifikasını kendi test telefonunuza yükleyip güvenilir olarak etkinleştirin. `rootCA-key.pem` özel anahtarını paylaşmayın. iOS'ta profil kurulumundan sonra Sertifika Güven Ayarları'nda tam güven etkinleştirilmelidir; Android'de CA sertifikası yükleme ayarını kullanın. İşletim sistemi sürümüne göre adımlar değişebilir. Sertifika uyarısını atlamak güvenilir sertifika kurulumunun yerine geçmez.

Önce açık geliştirme sunucularını durdurup 5173 ve 3001 portlarını boşaltın. Proje klasöründe **aynı IP'yi** kullanarak:

```sh
AGRUNIO_LOCAL_HTTPS=1 AGRUNIO_PHONE_ORIGIN=https://192.168.1.20:5173 npm run demo
```

Telefon ve bilgisayar aynı Wi-Fi'de olmalıdır. Telefonda `https://192.168.1.20:5173/#/scan`, diğer ekranda `https://192.168.1.20:5173/#/demo-labels` açın. Sertifika dosyaları eksikse HTTPS modu başlamaz. `.certs/` Git tarafından yok sayılır. Vite yerel ağda dinler; API **127.0.0.1:3001** üzerinde kalır. Telefonun `/api` istekleri Vite proxy üzerinden gider; backend yalnızca açıkça ayarlanan HTTPS origin'ini ve yerel origin'leri kabul eder. Gemini anahtarı mevcut sunucu `.env` dosyasında kalır.

Telefon farklı origin kullandığından kendi demo verisiyle açılır; bilgisayardaki kayıtlarla otomatik eşitlenmez. Bu sertifika/telefon kurulumunun fiziksel cihazda doğrulaması henüz yapılmadı.

### Mimari, lisanslar ve kontrol

- `src/scanning/catalog.ts`: sabit kod → ürün kimliği, salt okunur katalog ve manuel seçim. Store, AI veya ağ yazma erişimi yoktur.
- `src/scanning/decoder.ts`, `camera.ts`: QR/EAN-13 çözme, tek sonuç, izin, iptal ve track temizliği. Kamera çözücüsü yalnızca tarama başlatıldığında yüklenir.
- `ProductScanner.tsx`, `DemoLabels.tsx`, `scanning.css`: mevcut tasarımla kamera/manuel giriş ve etiket ekranları. Ürün detayı mevcut `DocumentQuestion` / `SourceCards` bileşenlerini kullanır.
- `vite.config.ts`, `server/origin.ts`, `scripts/dev.mjs`: isteğe bağlı yerel telefon HTTPS ve proxy erişimi.
- Kullanıcıya görünen marka **Agrunio** oldu. Veri kimlikleri, `fieldnote.demo.v2`, migration ve dil anahtarları korunmuştur; marka değişimi kayıtları sıfırlamaz.

| Paket                                                 | Kullanım                                    | Lisans                                                                  |
| ----------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| [@zxing/browser](https://github.com/zxing-js/browser) | Kamera video kareleri                       | [MIT](https://github.com/zxing-js/browser/blob/master/LICENSE)          |
| [@zxing/library](https://github.com/zxing-js/library) | QR ve EAN-13 çözme                          | [Apache-2.0](https://github.com/zxing-js/library/blob/master/LICENSE)   |
| [qrcode](https://github.com/soldair/node-qrcode)      | Demo QR üretimi; geliştirme bağımlılığı     | [MIT](https://github.com/soldair/node-qrcode/blob/master/license)       |
| [JsBarcode](https://github.com/lindell/JsBarcode)     | Demo EAN-13 üretimi; geliştirme bağımlılığı | [MIT](https://github.com/lindell/JsBarcode/blob/master/MIT-LICENSE.txt) |

Lisans metinleri `public/licenses/` içinde de bulunur.

Kontrol: **148/148 test geçti**; önceki 123 test korundu. Yeni 25 test kod/manuel giriş/seçimi, kayıtlara dokunulmadığını, bağlı belgeyi, gerçek SVG QR/EAN-13 çözümünü, kamera izni/çıkış/tekrar korumasını ve HTTPS origin sınırını doğrular. Otomatik testler kamera veya dış ağ kullanmaz. Build başarılı; Zod yorumları ve büyük bundle için engelleyici olmayan Vite uyarıları var.

Ayrı 5177 demo origin'inde mobil kontrol: 390 px'de manuel EAN → Demo Gübre A, 800 kg stok, **gerçek Gemini** ile 50 kg cevabı ve `doc-fertilizer-a / packaging` kaynak metni açıldı. Bilinmeyen URL ve elle Demo İlaç B seçimi çalıştı. 320 px'de dört etiket SVG'si yüklendi ve İngilizce geçişi çalıştı. Kontrol edilen ekranlarda yatay taşma yoktu. Taslak onaylanmadı ve mevcut kullanıcı kayıtları değiştirilmedi. **Fiziksel kamera ile gerçek tarama testi yapılmadı.** OCR, PDF yükleme, gerçek ürün/barkod kataloğu ve oyun arayüzü kapsamda değildir. Push veya yayınlama yapılmadı.

## İşlem etkilerinin hareketli açıklaması

`ImpactStory` mevcut karar önizlemesine bağlanır: işlem → atanmış kişi/tarla/ürün/ekipman → stok veya bağlı işler. Düğümler mevcut kayıtları açar. `src/presentation/impactScene.ts` yalnızca kayıt bağlantıları ve mevcut `Impact` nesneleriyle görünümü kurar; stok, açık, takvim ve bağımlılık hesapları hâlâ `src/domain/impacts.ts` içindedir. Bu katmanda ikinci hesaplama motoru, AI çağrısı veya repository yazımı yoktur. İkincil, zamanı doğrulanamayan bağlantılar açılabilir; tüm eski etkiler ve kanıtları ayrı ayrıntı bölümünde korunur.

Önizleme **onaylanmamış** olarak etiketlenir. Miktar düzenlendiğinde mevcut motor yeniden önizleme üretir; ilk AI ifadesinin ambalaj dönüşümü düzenlenen miktardan ayrı gösterilir. Arızada işçinin kendi kayıtlı müsaitliği korunur; tamir bitişi kayıtlı değilse tarih üretilmez. Ertelemede eski/önerilen zamanlar birlikte gösterilir; eksik saatler çakışma olmadığı anlamına gelmez.

Onay ve iptal, kaydırılan önizlemenin dışında sabit kontrollerdir. Başarılı yeni commit sonrasında, gerçek commit'in önce/sonra kayıtlarından bir **Kaydedildi** görünümü açılır. Sayaçlar yalnızca gerçek kaydedilmiş değerlere geçer; ara değerler uydurulmaz. Aynı işlem ikinci kez kaydedilmez. **Etkileri yeniden göster**, yalnızca React içindeki animasyon anahtarını yeniler; API, onay veya stok hareketi çağırmaz.

Hareketler `src/impactStory.css` içinde CSS/SVG ile yapılır; yeni animasyon bağımlılığı veya oyun motoru eklenmedi. Bağlantılar ve kısa vurgular en fazla yaklaşık 2,2 saniyede tamamlanır. Sonuç metinleri beklemeden okunabilir ve hareket bittikten sonra kalır. Görünürlük gözlemcisi ekran kapanınca temizlenir; iş verisine bağlı animasyon zamanlayıcısı yoktur. `prefers-reduced-motion: reduce` aynı bilgiyi ve bağlantıları hareketsiz gösterir. Kaynak bölümleri kısa açılma vurgusu alır, AI bekleyişinde yüzdesiz bir gösterge bulunur; kod eşleşmesi ürün geçişi ve stok değişmedi bildirimi verir.

Kontrol için `npm test` ve `npm run build` kullanın. Hareketin kendisi tarayıcı kontrolü gerektirir; otomatik testler gerçek Gemini çağırmaz.

Son kontrol: **157/157 test geçti** (önceki 148 test ve 9 sunum katmanı testi); build başarılı. Mevcut Zod açıklama/bundle boyutu uyarıları engelleyici değildir. 5180 portunda ayrı demo origin'i kullanıldı; mevcut 5173 kullanıcı kayıtları değiştirilmedi. Gübre, arıza ve erteleme önizlemeleri 320/390/430 px'de yatay taşmadan açıldı; onay/iptal düğmeleri en az 48 px kaldı. Gerçek Gemini ile 12 çuval → 600 kg ve 50 kg belge cevabı/kaynak bölümü doğrulandı. Ertelemede Gemini'nin eksik bıraktığı saatler kullanıcı seçim alanlarından 10:00–12:00 olarak tamamlanınca Doğu işiyle çakışma görüldü. Miktar düzenleme, iptal, yeniden oynatma, çift tıklamalı onay, tek tüketim kaydı ve yenileme sonrası 200 kg stok doğrulandı.

Üç mobil ekran görüntüsü ve gerçek tarayıcı karelerinden kısa GIF ekran kaydı `outputs/impact-motion/` altında yereldir; Git'e eklenmez. Fiziksel telefon/kamera ve işletim sisteminde azaltılmış hareket ayarıyla ayrı görsel test yapılmadı. Bağımsız bakım iş emirleri mevcut modelde bulunmadığından yeni bakım kaydı uydurulmadı; yalnızca kayıtlı makine tamir bitişi/eksikliği gösterilir. Tam çiftlik haritası eklenmedi. Bu aşamanın değişiklikleri push edilmedi.
