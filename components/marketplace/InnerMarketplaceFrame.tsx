export default function InnerMarketplaceFrame({children}:{children:React.ReactNode}){return <div className="incitta-inner-frame">{children}<style>{`
.incitta-inner-frame{min-height:100vh;background:#eaf2fb}
.incitta-inner-frame>main{background:#eaf2fb!important}
.incitta-inner-frame>main>div:last-child{max-width:1500px!important;width:100%;margin-inline:auto;padding-left:clamp(1rem,2.2vw,2rem);padding-right:clamp(1rem,2.2vw,2rem)}
@media(min-width:1024px){.incitta-inner-frame>main>div:last-child{padding-top:1.5rem;padding-bottom:2rem}.incitta-inner-frame>main>div:last-child>.grid{column-gap:1rem}}
@media(max-width:639px){.incitta-inner-frame>main>div:last-child{padding-top:1rem;padding-bottom:1.5rem}}
`}</style></div>}