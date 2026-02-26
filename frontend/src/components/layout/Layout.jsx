import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout({ title, children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <Header title={title} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
