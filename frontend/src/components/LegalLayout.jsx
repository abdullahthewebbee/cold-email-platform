export default function LegalLayout({ title, children }) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <a href="/login" className="text-sm text-teal-600 hover:underline">&larr; Back</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">{title}</h1>
        <p className="text-sm text-gray-400 mb-6">InboxAir — a product of Devlet Tech &middot; Last updated: {today}</p>
        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

export function H2({ children }) {
  return <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-1">{children}</h2>;
}
export function P({ children }) {
  return <p>{children}</p>;
}
export function UL({ children }) {
  return <ul className="list-disc pl-5 space-y-1">{children}</ul>;
}