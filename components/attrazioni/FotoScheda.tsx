"use client";

const FOTO: Record<string, string> = {
  "Castello Aragonese": "https://fai-platform.imgix.net/media/calabria/cs/2708_castello-aragonese.jpg?fit=crop&h=630&w=1200",
  "Protoconvento Francescano – SiMuCCà": "https://mycity.s3.sbg.io.cloud.ovh.net/4222084/PROTOCONVENTO-FRANCESCANO.jpg",
  "Museo Archeologico": "https://tourismmedia.italia.it/is/image/mitur/20230227121404_simucca-sistema-museale-citta-di-castrovillari_9-4?fit=constrain%2C1&fmt=webp&hei=500&wid=850",
  "Chiesa di San Giuseppe": "https://www.quicosenza.it/news/wp-content/uploads/2022/03/Santuario-Madonna-del-Castello-768x489-2.jpg",
  "Santa Maria delle Grazie": "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1d/b6/50/86/chiesa-della-madonna.jpg?h=1100&s=1&w=1100",
  "Palazzo Gallo": "https://1.bp.blogspot.com/-YbV-pY1tKlM/T-sOhTtZl0I/AAAAAAAAAm8/JwsbAAa5KUY/s1600/palazzo%2Bgallo%2B27%2B6%2B2012.JPG",
  "Palazzo Varcasia": "https://files.supersite.aruba.it/media/27294_11953e22c20bfd95315485c580b7f2b032480336.jpeg",

  "Carnevale di Castrovillari": "https://images.lac.atexcloud.io/view/acePublic/alias/contentid/1hktcaodtqxnl9pvi9u/0/gruppomascherato5-jpg.jpeg?f=3%3A2",
  "Primavera dei Teatri": "https://www.lavoceromana.it/images/Articoli/arte/Primavera_dei_teatri_2.jpeg",
  "Estate Internazionale del Folklore": "https://www.paese24.it/timthumb.php?q=90&src=https%3A%2F%2Fwww.paese24.it%2Fwp-content%2Fuploads%2F2016%2F08%2FEstate-FOLK-2016-n.jpg&w=650&zc=1",
  "Suoni Festival": "https://images.lac.atexcloud.io/view/acePublic/alias/contentid/1ljzjglpwjg87ybg8wh/0/sas-jpg.jpeg?f=3%3A2",
  "Festival della Legalità": "https://images.lac.atexcloud.io/view/acePublic/alias/contentid/1kdk8oxgrwrnu6zxbu0/0/festival-legalita-castrovillari.jpeg?f=3%3A2",
  "Pollicino Book Festival": "https://www.ideaginger.it/upload/pollicino-book-fest-beniamino-sidoti-alessandra-stabile-65f4066fdad71_65f7f34e8f467.jpg",
  "Calabria Wine & Design Festival": "https://static.winenews.it/2025/07/VinitalyTheCityCalabria-625x400.jpg",
  "Festival dei Quartieri": "https://ecodellojonio.b-cdn.net/media/posts/24/08/1724851132.jpg?aspect_ratio=16%3A9&width=785",
  "Rural Food Festival": "https://calabriastraordinaria.it/api/image-loader?q=75&url=https%3A%2F%2Fcalabriastraordinaria.it%2Fstorage%2Fimages%2F12278%2FRural-Food-Festival2.jpg&w=1200",
  "Vibe Fest e Joy Festival": "https://calabriastraordinaria.it/storage/images/14056/Vibe-Fest.jpg",

  "Morano Calabro": "https://www.finestresullarte.info/rivista/immagini/2022/fn/veduta-di-morano-calabro.jpg",
  "Civita": "https://101-zone.com/wp-content/uploads/2023/09/MG_2958-HDR.jpg-Calabria-Parco-Nazionale-del-Pollino.-Il-borgo-di-Civita-con-vista-delle-Gole-di-Raganello-e-il-Ponte-del-Diavolo.jpg",
  "Frascineto ed Eianina": "https://www.e-borghi.com/wp-content/uploads/2024/06/10_05_19-03_02_33-eaf7dccd2043a35bdfa1d3e4456f3423.jpg",
  "San Basile": "https://www.raiplay.it/dl/img/2025/11/04/1762269390989_STILL-PUNTATA-SAN-BASILE.jpg",
  "Mormanno": "https://www.comune.mormanno.cs.it/immagini/3.jpeg",
  "Altomonte": "https://www.e-borghi.com/wp-content/uploads/2024/06/20_09_17-12_26_10-E35d5c705daf979af17f1a4cec61f653.jpg",
  "Saracena": "https://www.calnews.it/wp-content/uploads/2019/09/Saracena.jpg",
  "Parco Nazionale del Pollino": "https://www.italia.it/content/dam/tdh/it/destinations/italia/parco-nazionale-del-pollino/media/2480X1000_parco_nazionale_del_pollino_destination.jpg",
};

export default function FotoScheda({ alt }: { query: string; alt: string }) {
  // Mostra solo immagini assegnate esplicitamente e verificate: niente foto casuali o riutilizzate come fallback.
  const src = FOTO[alt];

  return (
    <div className="relative flex h-44 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-slate-200">
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : (
        <div className="px-5 text-center text-blue-950/70">
          <div aria-hidden="true" className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-lg font-black shadow-sm">✦</div>
          <p className="text-xs font-bold uppercase tracking-[0.14em]">Castrovillari</p>
          <p className="mt-1 text-sm font-semibold">{alt}</p>
        </div>
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/10 via-transparent to-transparent" />
    </div>
  );
}
