"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FOTO: Record<string, string> = {
  "Castello Aragonese": "https://fai-platform.imgix.net/media/calabria/cs/2708_castello-aragonese.jpg?fit=crop&h=630&w=1200",
  "Protoconvento Francescano – SiMuCCà": "https://tourismmedia.italia.it/is/image/mitur/20230227121401_simucca-sistema-museale-citta-di-castrovillari_4-4?fit=hfit%2C1&fmt=webp&hei=500&wid=850",
  "Museo Archeologico": "https://tourismmedia.italia.it/is/image/mitur/20230227121404_simucca-sistema-museale-citta-di-castrovillari_9-4?fit=constrain%2C1&fmt=webp&hei=500&wid=850",
  "Santa Maria delle Grazie": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1d/b6/50/86/chiesa-della-madonna.jpg?h=1100&s=1&w=1100",
  "Palazzo Gallo": "https://1.bp.blogspot.com/-YbV-pY1tKlM/T-sOhTtZl0I/AAAAAAAAAm8/JwsbAAa5KUY/s1600/palazzo%2Bgallo%2B27%2B6%2B2012.JPG",
  "Palazzo Varcasia": "https://files.supersite.aruba.it/media/27294_11953e22c20bfd95315485c580b7f2b032480336.jpeg",
  "La Civita e il centro storico": "https://i0.wp.com/visitcalabria.uk/wp-content/uploads/2022/02/Castrovillari_civita-old-town.jpg?fit=443%2C462&ssl=1",
  "Teatro Sybaris": "https://ecodellojonio.b-cdn.net/media/posts/24/10/1729690203.jpg?aspect_ratio=16%3A9&width=785",
  "Biblioteca Civica Umberto Caldora": "https://www.paese24.it/timthumb.php?q=90&src=https%3A%2F%2Fwww.paese24.it%2Fwp-content%2Fuploads%2F2018%2F06%2Flefigaroconsegna3.jpg&w=650&zc=1",
  "Primafila": "https://ecodellojonio.b-cdn.net/media/posts/25/12/1766998699.jpg?aspect_ratio=16%3A9&width=785",
  "Chiesa di San Giuseppe": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1b/4c/35/fd/img-20200422-201626-largejpg.jpg?h=-1&s=1&w=1200",
  "Palazzo Cappelli": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1d/b6/51/01/palazzo-cqppelli.jpg?h=1200&s=1&w=1200",
  "Archivio di Stato – Sezione di Castrovillari": "https://media.cultura.gov.it/mibac/files/1682/Archivio%20di%20Stato%20di%20Castrovillari_Modificato.jpg",

  "Carnevale di Castrovillari": "https://calabriastraordinaria.it/storage/images/15208/Carnevale-di-Castrovillari_-programma.jpg",
  "Primavera dei Teatri": "https://calabriastraordinaria.it/api/image-loader?q=75&url=https%3A%2F%2Fcalabriastraordinaria.it%2Fstorage%2Fimages%2F16023%2FPrimavera-dei-teatri-2026-%25281%2529.jpg&w=1200",
  "Estate Internazionale del Folklore": "https://calabriastraordinaria.it/storage/images/13575/Estate-Internazionale-del-Folklore-e-del-Parco-del-Pollino.jpg",

  "Festival della Legalità": "https://calabriastraordinaria.it/api/image-loader?q=75&url=https%3A%2F%2Fcalabriastraordinaria.it%2Fstorage%2Fimages%2F15572%2FContro-le-Mafie---Festival-della-legalit%25C3%25A0.jpg&w=1200",
  "Pollicino Book Festival": "https://www.ideaginger.it/upload/pollicino-book-fest-beniamino-sidoti-alessandra-stabile-65f4066fdad71_65f7f34e8f467.jpg",

  "Festival dei Quartieri": "https://ecodellojonio.b-cdn.net/media/posts/24/08/1724851132.jpg?aspect_ratio=16%3A9&width=785",
  "Rural Food Festival": "https://calabriastraordinaria.it/api/image-loader?q=75&url=https%3A%2F%2Fcalabriastraordinaria.it%2Fstorage%2Fimages%2F12278%2FRural-Food-Festival2.jpg&w=1200",
  "Vibe Fest": "https://calabriastraordinaria.it/storage/images/14056/Vibe-Fest.jpg",

  "Rigenerazioni Fest": "https://calabriastraordinaria.it/api/image-loader?q=75&url=https%3A%2F%2Fcalabriastraordinaria.it%2Fstorage%2Fimages%2F16087%2FRiGenerazioni.jpg&w=1200",
  "Radure – Invito al teatro": "https://images.lac.atexcloud.io/view/acePublic/alias/contentid/1ndl605ybcgzcf9q8ls/0/polemos-lessico-guerra-jpg.jpeg?f=3%3A2",
  "Càlabbria Teatro Festival": "https://images.lac.atexcloud.io/view/acePublic/alias/contentid/1m8x5gp11zgmwemnehd/0/image.webp?f=3%3A2&q=0.75&w=1920",
  "I-Fest International Film Festival": "https://pad.mymovies.it/cinemanews/2024/189546/coverlg.jpg",
  "Castrovillari Film Festival": "https://calabriastraordinaria.it/storage/images/14060/Castrovillari-Film-Festival.jpg",
  "Peperoncino Jazz Festival": "https://ecodellojonio.b-cdn.net/media/posts/25/07/1752903914.jpg?aspect_ratio=16%3A9&width=785",
  "Festival della Cipolla Bianca": "https://calabriastraordinaria.it/api/image-loader?q=75&url=https%3A%2F%2Fcalabriastraordinaria.it%2Fstorage%2Fimages%2F13393%2FFestival-della-Cipolla-Bianca-di-Castrovillari.jpg&w=1200",
  "Civita Nova – Radicarsi": "https://images.lac.atexcloud.io/view/acePublic/alias/contentid/1ljzjglpwjg87ybg8wh/0/sas-jpg.jpeg?f=3%3A2",

  "Morano Calabro": "https://www.finestresullarte.info/rivista/immagini/2022/fn/veduta-di-morano-calabro.jpg",
  "Civita": "https://101-zone.com/wp-content/uploads/2023/09/MG_2958-HDR.jpg-Calabria-Parco-Nazionale-del-Pollino.-Il-borgo-di-Civita-con-vista-delle-Gole-di-Raganello-e-il-Ponte-del-Diavolo.jpg",
  "Frascineto ed Eianina": "https://www.e-borghi.com/wp-content/uploads/2024/06/10_05_19-03_02_33-eaf7dccd2043a35bdfa1d3e4456f3423.jpg",
  "San Basile": "https://parconazionalepollino.it/images/paesi_calabria_pollino/san_basile/san_basile_panorama.jpg",
  "Mormanno": "https://www.comune.mormanno.cs.it/immagini/3.jpeg",
  "Altomonte": "https://www.e-borghi.com/wp-content/uploads/2024/06/20_09_17-12_26_10-E35d5c705daf979af17f1a4cec61f653.jpg",
  "Saracena": "https://www.calnews.it/wp-content/uploads/2019/09/Saracena.jpg",
  "Parco Nazionale del Pollino": "https://www.italia.it/content/dam/tdh/it/destinations/italia/parco-nazionale-del-pollino/media/2480X1000_parco_nazionale_del_pollino_destination.jpg",
  "Suoni Festival": "https://ecodellojonio.b-cdn.net/media/posts/26/07/1783425040.jpeg?aspect_ratio=16%3A9&width=785",
  "Joy Festival": "https://ecodellojonio.b-cdn.net/media/posts/21/08/1629363164.jpg?aspect_ratio=16%3A9&width=785",
  "Calabria Wine & Design Festival": "https://www.parks.it/imgnews.php?f=1&idn=82682",
  "Festival dei Lettori": "https://www.castrovillari.info/news/foto/THEREADERS2016.jpg",
  "Clap! Etno Music Fest": "https://calabriastraordinaria.it/storage/images/13319/Castrovillari-citta%CC%80-festival.jpg",
};
const FOTO_ALTERNATIVE: Record<string, string> = {
  "La Civita e il centro storico": "https://www.calabriafilmcommission.it/wp-content/uploads/2022/04/9-4-Castrovillari.jpg",
  "Biblioteca Civica Umberto Caldora": "https://mycity.s3.sbg.io.cloud.ovh.net/3427528/download.jpeg",
  "Chiesa di San Giuseppe": "https://mycity.s3.sbg.io.cloud.ovh.net/3431230/Castrovillari-1024x768.jpeg",
  "Archivio di Stato – Sezione di Castrovillari": "https://archiviodistatocosenza.cultura.gov.it/fileadmin/_processed_/4/e/csm_Apertura_Cv_20Mar_SITO_ecd39a5167.jpg",
  "San Basile": "https://d3wo5wojvuv7l.cloudfront.net/t_square_limited_720/images.spreaker.com/original/2f272a0c52ce773c666533486630b848.jpg",
};
export default function FotoScheda({ query, alt }: { query: string; alt: string }) {
  const [officialSrc, setOfficialSrc] = useState<string | null>(null);
  const [officialChecked, setOfficialChecked] = useState(false);
  const [staticFailed, setStaticFailed] = useState(false);
  const [alternativeFailed, setAlternativeFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const staticSrc = FOTO[alt];
  const alternativeSrc = FOTO_ALTERNATIVE[alt];
  const src =
    staticSrc && !staticFailed
      ? staticSrc
      : alternativeSrc && !alternativeFailed
        ? alternativeSrc
        : officialSrc;

  useEffect(() => {
    if ((staticSrc && !staticFailed) || (alternativeSrc && !alternativeFailed)) return;

    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setOfficialChecked(false);

    fetch(`/api/attrazioni/foto?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active) return;
        const candidate = data?.photoUrl;
        if (typeof candidate !== "string") return;
        try {
          const url = new URL(candidate);
          if (url.protocol === "https:" || url.protocol === "http:") {
            setOfficialSrc(url.toString());
          }
        } catch {
          // A malformed image URL is treated as unavailable.
        }
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setOfficialChecked(true);
      });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [alt, query, staticFailed, alternativeFailed, staticSrc, alternativeSrc]);

  const handleImageFailure = useCallback(() => {
    if (staticSrc && !staticFailed) {
      setStaticFailed(true);
      setOfficialSrc(null);
      setOfficialChecked(false);
      return;
    }
    if (alternativeSrc && !alternativeFailed) {
      setAlternativeFailed(true);
      setOfficialSrc(null);
      setOfficialChecked(false);
      return;
    }
    setOfficialSrc(null);
    setOfficialChecked(true);
  }, [staticSrc, staticFailed, alternativeSrc, alternativeFailed]);

  // Handle images that failed before React hydration, when onError was not attached.
  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth === 0) {
      handleImageFailure();
    }
  }, [src, handleImageFailure]);

  return (
    <div className="relative flex h-44 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200">
      {src ? (
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          onError={handleImageFailure}
        />
      ) : (
        <div className="px-5 text-center text-blue-950/70">
          <div aria-hidden="true" className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-lg font-black shadow-sm">✦</div>
          <p className="text-xs font-bold uppercase tracking-[0.14em]">
            {officialChecked ? "Foto non disponibile" : "Caricamento foto ufficiale"}
          </p>
          <p className="mt-1 text-sm font-semibold">{alt}</p>
        </div>
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/10 via-transparent to-transparent" />
    </div>
  );
}
