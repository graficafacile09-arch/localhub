import {
    Store,
    UtensilsCrossed,
    Shirt,
    Wrench,
    HeartPulse,
    Car,
    House,
    Gift,
    Sparkles,
    Smartphone,
    Baby,
  } from "lucide-react";
  
  const categorie = [
    { nome: "Negozi", icona: Store },
    { nome: "Food", icona: UtensilsCrossed },
    { nome: "Moda", icona: Shirt },
    { nome: "Servizi", icona: Wrench },
    { nome: "Salute", icona: HeartPulse },
    { nome: "Beauty", icona: Sparkles },
    { nome: "Auto", icona: Car },
    { nome: "Casa", icona: House },
    { nome: "Tech", icona: Smartphone },
    { nome: "Bimbi", icona: Baby },
    { nome: "Regali", icona: Gift },
  ];
  
  export default function Categories() {
    return (
      <section className="max-w-7xl mx-auto py-16 px-4">
  
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-10">
          Esplora le categorie
        </h2>
  
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
  
          {categorie.map((categoria) => {
  
            const Icona = categoria.icona;
  
            return (
  
              <div
                key={categoria.nome}
                className="
                  bg-white
                  rounded-3xl
                  shadow-md
                  hover:shadow-xl
                  hover:-translate-y-1
                  transition-all
                  duration-300
                  p-8
                  text-center
                  cursor-pointer
                "
              >
  
                <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center">
  
                  <Icona
                    size={34}
                    className="text-blue-700"
                  />
  
                </div>
  
                <h3 className="mt-5 text-lg font-bold text-gray-800">
                  {categoria.nome}
                </h3>
  
              </div>
  
            );
  
          })}
  
        </div>
  
      </section>
    );
  }