# Fieldnote — çiftliğin dijital defteri

Küçük çiftlikler için mobil öncelikli hackathon prototipi. React + TypeScript + Vite ile hazırlanmıştır. Türkçe varsayılandır; üstteki **TR / EN** düğmeleriyle sunum için İngilizce seçilebilir. Dil tercihi bu tarayıcıda saklanır. Ücretli servis, API anahtarı veya gerçek kullanıcı hesabı gerektirmez. Font ve ikonlar yereldir; çalışırken harici servis çağrısı yapmaz.

Arayüz yetişkin çiftçiler için kompakt başlık, okunaklı DM Sans fontu, yaklaşık 16–18 px ana metin ve en az 48 px dokunma hedefleri kullanır. Zeytin yeşili, kiremit kırmızısı, buğday sarısı ve krem tonları hafif derinlik veren gölgelerle uygulanır. Bugünkü işler, açıklamalı stok açığı ve işlem girişi önceliklidir. Antigravity görselleri kullanılmaz.

## Kurulum ve çalıştırma

Node.js **22.12 veya üzeri** gerekir (alternatif: Node 20.19+).

Proje klasöründe terminal açıp çalıştırın:

```sh
npm install
npm run dev
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

Terminaldeki ağ adresini telefonda açın. Bu komut uygulamayı yerel ağda erişilebilir yapar; internete yayınlamaz. Veriler tarayıcı ve origin başına ayrı saklanır; bilgisayar ile telefon otomatik eşitlenmez.

## İlk demo senaryosu

1. **Bugün** ekranında **Çiftlikte ne oldu?** alanına şunu yazın:

   `Kuzey tarlasında 600 kg gübre kullandım`

   **Desteklenen örnekleri göster** içindeki bir örneğe dokunarak da alanı doldurabilirsiniz.

2. **İşlemi incele** düğmesine basın. Tarla, iş, malzeme ve miktarı içeren düzenlenebilir taslak açılır. Henüz hiçbir kayıt değişmez.
3. Önizleme **800 kg → 200 kg** gösterir. Doğu işi **300 kg** gerektirdiğinden **100 kg** eksik kalacağı görünür. Bu rakamları uygulama kodu hesaplar.
4. **Kaynak kayıtları** içindeki İş, Stok ve Tarla düğmeleri gerçek detay sayfalarını açar. **İncelemeye devam et** ile taslağa dönülür.
5. **Onayla ve kaydet** ile Kuzey gübreleme işi tamamlanır, tüketim kaydı oluşturulur ve fiziksel stok **200 kg** olur.
6. **İşler → Tamamlandı** ve **Çiftliğim → Depo → Demo Gübre A** üzerinden sonucu inceleyin. Yenileme sonrası kayıtlar korunur. Aynı iş veya işlem tekrar onaylanırsa ikinci kez stok düşmez.
7. Kuzey ekim işi artık önkoşulunu karşılar. Ekim için malzeme girilmediği açıkça belirtilir; tamamlamak seed tüketimi uydurmaz.
8. **Çiftliğim → Demo verilerini sıfırla** ile, ikinci bir onaydan sonra başlangıç verilerine dönülür.

Miktarı önizlemede değiştirebilir veya **Taslağı iptal et** ile işlemi iptal edebilirsiniz. Fiziksel stoktan fazla tüketim, sıfır/negatif/geçersiz miktar ve yanlış iş–tarla–malzeme eşleştirmeleri engellenir. Nokta veya virgül ile en fazla üç ondalık basamak kabul edilir; binlik ayırıcı kullanmayın.

## Yerel yorumlayıcı

Ekranda açıkça **“Demo yorumlayıcı — gerçek AI bağlı değil”** yazısı bulunur. İngilizce seçilirse **“Demo interpreter — no real AI connected”** gösterilir. Yorumlayıcı sadece dar bir yerel metin kalıbını tanır. Gerçek AI gibi serbest cevap üretmez.

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
  styles.css                      Mobil/masaüstü görünüm
  operations.css                  Yetişkinlere uygun görsel sistem ve mobil düzen
  i18n/tr.json                     Türkçe arayüz ve mesajlar
  i18n/en.json                     İngilizce arayüz ve mesajlar
  i18n/messages.ts                 Kayıtları değiştirmeden metin yerelleştirme
  i18n/messages.test.ts            Dil ve veri koruma testleri
  components/Dialog.tsx            Erişilebilir native dialog
  domain/types.ts                  Kayıt ve taslak tipleri
  domain/demo.ts                   Başlangıç demo verileri
  domain/operations.ts             Hesaplama, doğrulama, idempotent kayıt
  domain/storage.ts                Versiyonlu localStorage ve doğrulama
  domain/operations.test.ts        Senaryo ve hata testleri
  hooks/useFarm.ts                 Depolama, sekme eşitleme, yazma akışı
  interpreter/demoInterpreter.ts   Değiştirilebilir yorumlayıcı arayüzü
```

## Sürümün sınırları

- Tek çiftlik, tek demo kullanıcı; gerçek giriş, kullanıcı yetkileri veya sunucu yoktur.
- Tarla/ekip/makine/stok kayıtları ilk sürümde örnek kayıt olarak okunur. Yeni iş planlanabilir; varlık ekleme/düzenleme ve stok girişi sonraki aşamadır.
- Gerçek AI, RAG, sensör, hava durumu, bildirim servisi veya doküman araması yoktur.
- Gübre/ilaç belge desteği **Henüz bağlı değil / Not connected yet** olarak gösterilir. Gerçek etiket, doz, teşhis veya güvenli kullanım tavsiyesi üretilmez.
- Dar yorumlayıcı tüm Türkçe/İngilizce cümleleri anlayamaz. Yalnızca belgelenen kalıplar desteklenir.
- Kısmi bir miktarın onaylanması işi tamamlar; iş başına bir tüketim kaydı vardır. Çok aşamalı tüketim ve düzeltme/iptal defteri sonraki aşamadır.
- Ekimde tohum bilgisi yoktur; ekim tamamlama yalnızca iş durumunu değiştirir. Tarla ürün aşaması otomatik güncellenmez.
- İşler gün/sıra seviyesinde temsil edilir. Saat bazlı ekip/makine çakışma kontrolü ve gerçek takvim yoktur.
- Veriler yalnızca bu tarayıcının localStorage alanındadır. Tarayıcı verileri silinirse kayıtlar kaybolur; merkezi yedek veya cihazlar arası eşitleme yoktur. Bozuk kayıtlar sessizce üzerine yazılmaz, sıfırlama istenir.
- Aynı anda çok kullanıcılı kullanım için sunucu tarafı transaction gerekir. Web Locks desteklemeyen tarayıcılarda sekmeler arası yarışlara karşı tam garanti verilmez.
- Taslak henüz onaylanmadığı için yalnızca sayfa içinde tutulur; sayfa yenilenirse taslak silinir, onaylanmış kayıtlar kalır.
- PWA/offline kurulum ve service worker yoktur. Kurulumdan sonra uygulama servis veya anahtar gerektirmez, ancak yerel geliştirme/preview sunucusu açık olmalıdır.

## Gerçek AI için sonraki adım

`FarmInterpreter` arayüzünü uygulayan bir backend adaptörü ekleyin. Frontend, metni ve sınırlı kayıt bağlamını sunucudaki endpoint’e gönderir; sunucu, gizli ortam değişkeninde tutulan API anahtarıyla modelden şemaya uygun **taslak** ister. Anahtar `VITE_*` değişkenine veya tarayıcı koduna konulmaz.

Model yalnızca kayıt eşleştirme ve taslak önerisi yapar. Hesap, stok yeterliliği, yetki, kullanıcı onayı ve idempotent transaction sunucu tarafından doğrulanır; mevcut önizleme/onay deneyimi korunur. Ardından veritabanı, oturum ve ekip yetkilendirmesi eklenir. Belge/RAG desteği ayrı bir aşamadır ve bu prototipte bağlı değildir.
