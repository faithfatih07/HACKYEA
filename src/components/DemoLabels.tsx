import { t, useLanguage } from "../i18n";
import type { Product } from "../domain/types";
import { demoProductCodes, selectCatalogProduct } from "../scanning/catalog";

export function DemoLabels({ products }: { products: Product[] }) {
  useLanguage();
  return (
    <>
      <p className="scan-label-intro">{t("scanLabelHelp")}</p>
      <div className="demo-label-grid">
        {demoProductCodes.map((codes) => {
          const product = selectCatalogProduct(codes.productId, products);
          if (!product) return null;
          return (
            <article className="panel demo-product-label" key={codes.productId}>
              <span className="pill yellow">{t("syntheticDocument")}</span>
              <h2>{product.name}</h2>
              <p>{t("scanDemoOnly")}</p>
              <img
                className="demo-qr"
                src={codes.qrImage}
                alt={t("scanQrAlt", { product: product.name })}
                width={256}
                height={256}
              />
              <code>{codes.qr}</code>
              <img
                className="demo-barcode"
                src={codes.barcodeImage}
                alt={t("scanEanAlt", {
                  product: product.name,
                  code: codes.ean13,
                })}
                width={260}
                height={90}
              />
              <code>{codes.ean13}</code>
              <a className="button light" href={codes.qrImage} download>
                {t("scanDownloadQr")}
              </a>
            </article>
          );
        })}
      </div>
      <p className="fine-print">{t("scanScope")}</p>
    </>
  );
}
