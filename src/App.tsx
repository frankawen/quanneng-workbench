import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Finance from './pages/Finance'
import Habits from './pages/Habits'
import Fitness from './pages/Fitness'
import Wishlist from './pages/Wishlist'
import DailyRead from './pages/DailyRead'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="finance" element={<Finance />} />
        <Route path="habits" element={<Habits />} />
        <Route path="fitness" element={<Fitness />} />
        <Route path="wishlist" element={<Wishlist />} />
        <Route path="daily-read" element={<DailyRead />} />
      </Route>
    </Routes>
  )
}

export default App
