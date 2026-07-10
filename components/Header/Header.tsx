export default function Header() {
    return (
      <header className="bg-blue-700 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
  
          <div>
            <h1 className="text-3xl font-bold text-white">
              LOCALHUB
            </h1>
            <p className="text-blue-100 text-sm">
              Trova tutto nella tua città
            </p>
          </div>
  
          <nav className="flex gap-8 text-white font-medium">
            <a href="#" className="hover:text-blue-200">
              Home
            </a>
  
            <a href="#" className="hover:text-blue-200">
              Negozi
            </a>
  
            <a href="#" className="hover:text-blue-200">
              Categorie
            </a>
  
            <a href="#" className="hover:text-blue-200">
              Contatti
            </a>
          </nav>
  
        </div>
      </header>
    );
  }