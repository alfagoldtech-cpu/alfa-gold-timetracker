import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  getAllClients, 
  createClient, 
  updateClientStatus,
  getAllKveds,
  getClientWithRelations
} from '../lib/clients'
import { getDepartmentsByProject } from '../lib/users'
import { supabase } from '../lib/supabase'
import type { Client, Kved, Department, ClientWithRelations } from '../types/database'

interface ClientWithDepartments extends Client {
  departments?: Department[]
}
import './AdminPages.css'
import './ManagerDashboard.css'

export default function ClientsPage() {
  const { user } = useAuth()
  const [clients, setClients] = useState<ClientWithDepartments[]>([])
  const [kveds, setKveds] = useState<Kved[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientWithRelations | null>(null)
  const [clientToToggle, setClientToToggle] = useState<Client | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [clientForm, setClientForm] = useState({
    edrpou: '',
    legal_name: '',
    phone: '',
    status: 'active',
    company_group: '',
    service_cost: '',
    company_folder: '',
    client_card: '',
    address: '',
    city: '',
    kved_id: 0,
    activity_type: '',
    email: '',
    type: '',
    director_full_name: '',
    gender: '',
    iban: '',
    bank_name: '',
    department_ids: [] as number[]
  })

  useEffect(() => {
    if (user?.project_id) {
      loadData()
    }
  }, [user?.project_id])

  const loadData = async () => {
    if (!user?.project_id) return

    setLoading(true)
    try {
      const [clientsData, kvedsData, departmentsData] = await Promise.all([
        getAllClients(),
        getAllKveds(),
        getDepartmentsByProject(user.project_id)
      ])
      
      // Завантажуємо відділи для кожного клієнта
      const clientsWithDepartments = await Promise.all(
        clientsData.map(async (client) => {
          const clientWithRelations = await getClientWithRelations(client.id)
          return {
            ...client,
            departments: clientWithRelations?.departments || []
          }
        })
      )
      
      setClients(clientsWithDepartments)
      setKveds(kvedsData)
      setDepartments(departmentsData)
      
      if (kvedsData.length === 0) {
        console.warn('КВЕДи не знайдено.')
        console.warn('Переконайтеся, що виконано міграції:')
        console.warn('1. 003_create_kveds.sql - створення таблиці')
        console.warn('2. 005_insert_kveds.sql - вставка даних')
        setError('КВЕДи не завантажено. Перевірте консоль браузера для деталей.')
      } else {
        // Очищаємо помилку, якщо КВЕДи завантажилися
        if (error && error.includes('КВЕДи')) {
          setError(null)
        }
      }
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Не вдалося завантажити дані')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!clientForm.legal_name.trim()) {
      setError('Введіть юридичну назву')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const newClient = await createClient({
        edrpou: clientForm.edrpou || undefined,
        legal_name: clientForm.legal_name,
        phone: clientForm.phone || undefined,
        status: clientForm.status,
        company_group: clientForm.company_group || undefined,
        service_cost: clientForm.service_cost ? parseFloat(clientForm.service_cost) : undefined,
        company_folder: clientForm.company_folder || undefined,
        client_card: clientForm.client_card || undefined,
        address: clientForm.address || undefined,
        city: clientForm.city || undefined,
        kved_id: clientForm.kved_id > 0 ? clientForm.kved_id : undefined,
        activity_type: clientForm.activity_type || undefined,
        email: clientForm.email || undefined,
        type: clientForm.type || undefined,
        director_full_name: clientForm.director_full_name || undefined,
        gender: clientForm.gender || undefined,
        iban: clientForm.iban || undefined,
        bank_name: clientForm.bank_name || undefined,
      })

      if (newClient) {
        // Якщо є відділи, призначаємо їх
        if (clientForm.department_ids.length > 0 && newClient.id) {
          try {
            const departmentResults = await Promise.all(
              clientForm.department_ids.map(deptId =>
                supabase.from('client_departments').insert({
                  client_id: newClient.id,
                  department_id: deptId
                })
              )
            )
            
            // Перевіряємо чи є помилки
            const errors = departmentResults.filter(result => result.error)
            if (errors.length > 0) {
              console.error('Помилки при збереженні відділів:', errors)
              setError('Клієнт створено, але не вдалося зберегти всі відділи')
            }
          } catch (deptError) {
            console.error('Помилка при збереженні відділів:', deptError)
            setError('Клієнт створено, але не вдалося зберегти відділи')
          }
        }

        setSuccess(`Клієнт "${clientForm.legal_name}" успішно створено`)
        setClientForm({
          edrpou: '',
          legal_name: '',
          phone: '',
          status: 'active',
          company_group: '',
          service_cost: '',
          company_folder: '',
          client_card: '',
          address: '',
          city: '',
          kved_id: 0,
          activity_type: '',
          email: '',
          type: '',
          director_full_name: '',
          gender: '',
          iban: '',
          bank_name: '',
          department_ids: []
        })
        setShowCreateModal(false)
        await loadData()
      } else {
        setError('Не вдалося створити клієнта')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка створення клієнта')
    }
  }

  const handleViewClient = async (client: Client) => {
    try {
      const clientWithRelations = await getClientWithRelations(client.id)
      setSelectedClient(clientWithRelations)
      setShowViewModal(true)
    } catch (err) {
      console.error('Error loading client details:', err)
      setError('Не вдалося завантажити дані клієнта')
    }
  }

  const handleToggleStatusClick = (client: Client) => {
    setClientToToggle(client)
    setShowConfirmModal(true)
  }

  const handleConfirmToggleStatus = async () => {
    if (!clientToToggle) return

    const newStatus = clientToToggle.status === 'active' ? 'inactive' : 'active'
    
    setError(null)
    setSuccess(null)

    try {
      const success = await updateClientStatus(clientToToggle.id, newStatus)
      
      if (success) {
        setSuccess(`Клієнт "${clientToToggle.legal_name}" ${newStatus === 'active' ? 'активовано' : 'деактивовано'}`)
        setShowConfirmModal(false)
        setClientToToggle(null)
        await loadData()
      } else {
        setError('Не вдалося змінити статус клієнта')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка зміни статусу клієнта')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const toggleDepartment = (departmentId: number) => {
    setClientForm(prev => ({
      ...prev,
      department_ids: prev.department_ids.includes(departmentId)
        ? prev.department_ids.filter(id => id !== departmentId)
        : [...prev.department_ids, departmentId]
    }))
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading">Завантаження...</div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Клієнти</h2>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Створити клієнта
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ЕДРПОУ</th>
              <th>Юр. назва</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Місто</th>
              <th>Відділи</th>
              <th>Статус</th>
              <th>Вартість обслуговування</th>
              <th>Дата створення</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px' }}>
                  Немає клієнтів
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.edrpou || '-'}</td>
                  <td>{client.legal_name}</td>
                  <td>{client.phone || '-'}</td>
                  <td>{client.email || '-'}</td>
                  <td>{client.city || '-'}</td>
                  <td>
                    {client.departments && client.departments.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {client.departments.map((dept) => (
                          <span 
                            key={dept.id}
                            className="status-badge"
                            style={{ 
                              background: '#e6f2ff', 
                              color: '#2c5282',
                              fontSize: '11px',
                              padding: '4px 10px'
                            }}
                          >
                            {dept.department_name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${client.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                      {client.status === 'active' ? 'Активний' : client.status === 'inactive' ? 'Неактивний' : 'Не вказано'}
                    </span>
                  </td>
                  <td>{formatCurrency(client.service_cost)}</td>
                  <td>{formatDate(client.created_at)}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className={`btn-action btn-toggle ${client.status === 'active' ? 'inactive' : 'active'}`}
                        onClick={() => handleToggleStatusClick(client)}
                        title={client.status === 'active' ? 'Деактивувати' : 'Активувати'}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                          <line x1="12" y1="2" x2="12" y2="12"></line>
                        </svg>
                      </button>
                      <button
                        className="btn-action btn-view"
                        onClick={() => handleViewClient(client)}
                        title="Перегляд"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Створити клієнта</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateClient}>
              <div className="form-row">
                <div className="form-group">
                  <label>ЕДРПОУ</label>
                  <input
                    type="text"
                    value={clientForm.edrpou}
                    onChange={(e) => setClientForm({ ...clientForm, edrpou: e.target.value })}
                    placeholder="Введіть ЕДРПОУ"
                  />
                </div>
                <div className="form-group">
                  <label>Юр. назва *</label>
                  <input
                    type="text"
                    value={clientForm.legal_name}
                    onChange={(e) => setClientForm({ ...clientForm, legal_name: e.target.value })}
                    placeholder="Введіть юридичну назву"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Телефон</label>
                  <input
                    type="tel"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    placeholder="Введіть телефон"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={clientForm.email}
                    onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                    placeholder="Введіть email"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Статус</label>
                  <select
                    value={clientForm.status}
                    onChange={(e) => setClientForm({ ...clientForm, status: e.target.value })}
                  >
                    <option value="active">Активний</option>
                    <option value="inactive">Неактивний</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Група компаній</label>
                  <input
                    type="text"
                    value={clientForm.company_group}
                    onChange={(e) => setClientForm({ ...clientForm, company_group: e.target.value })}
                    placeholder="Введіть групу компаній"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Вартість обслуговування</label>
                  <input
                    type="number"
                    step="0.01"
                    value={clientForm.service_cost}
                    onChange={(e) => setClientForm({ ...clientForm, service_cost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Місто</label>
                  <input
                    type="text"
                    value={clientForm.city}
                    onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })}
                    placeholder="Введіть місто"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Адреса</label>
                <input
                  type="text"
                  value={clientForm.address}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                  placeholder="Введіть адресу"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>КВЕД</label>
                  <select
                    value={clientForm.kved_id || ''}
                    onChange={(e) => setClientForm({ ...clientForm, kved_id: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%' }}
                  >
                    <option value="">Оберіть КВЕД</option>
                    {kveds.length === 0 ? (
                      <option value="" disabled>КВЕДи не завантажено. Виконайте міграцію 005_insert_kveds.sql</option>
                    ) : (
                      kveds.map((kved) => (
                        <option key={kved.id} value={kved.id}>
                          {kved.code} - {kved.description}
                        </option>
                      ))
                    )}
                  </select>
                  {kveds.length === 0 && (
                    <small style={{ color: '#e53e3e', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      КВЕДи не знайдено. Переконайтеся, що міграція виконана в Supabase.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Вид діяльності</label>
                  <input
                    type="text"
                    value={clientForm.activity_type}
                    onChange={(e) => setClientForm({ ...clientForm, activity_type: e.target.value })}
                    placeholder="Введіть вид діяльності"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>ПІБ директора</label>
                  <input
                    type="text"
                    value={clientForm.director_full_name}
                    onChange={(e) => setClientForm({ ...clientForm, director_full_name: e.target.value })}
                    placeholder="Введіть ПІБ директора"
                  />
                </div>
                <div className="form-group">
                  <label>Стать</label>
                  <select
                    value={clientForm.gender}
                    onChange={(e) => setClientForm({ ...clientForm, gender: e.target.value })}
                  >
                    <option value="">Не вказано</option>
                    <option value="male">Чоловік</option>
                    <option value="female">Жінка</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>IBAN</label>
                  <input
                    type="text"
                    value={clientForm.iban}
                    onChange={(e) => setClientForm({ ...clientForm, iban: e.target.value })}
                    placeholder="Введіть IBAN"
                  />
                </div>
                <div className="form-group">
                  <label>Назва банку</label>
                  <input
                    type="text"
                    value={clientForm.bank_name}
                    onChange={(e) => setClientForm({ ...clientForm, bank_name: e.target.value })}
                    placeholder="Введіть назву банку"
                  />
                </div>
              </div>
              {departments.length > 0 && (
                <div className="form-group">
                  <label>Відділи обслуговування</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
                    {departments.map((dept) => (
                      <label
                        key={dept.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          padding: '8px 12px',
                          background: '#f7fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={clientForm.department_ids.includes(dept.id)}
                          onChange={() => toggleDepartment(dept.id)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 500, color: '#2d3748' }}>{dept.department_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary">
                  Створити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmModal && clientToToggle && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setClientToToggle(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); setClientToToggle(null); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете {clientToToggle.status === 'active' ? 'деактивувати' : 'активувати'} клієнта?
              </p>
              <div style={{ 
                background: '#f7fafc', 
                padding: '16px', 
                borderRadius: '8px',
                marginBottom: '24px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Юр. назва:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{clientToToggle.legal_name}</div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>ЕДРПОУ:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{clientToToggle.edrpou || '-'}</div>
                </div>
                <div>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Email:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{clientToToggle.email || '-'}</div>
                </div>
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setShowConfirmModal(false); setClientToToggle(null); }}
                >
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className={`btn-primary ${clientToToggle.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                  onClick={handleConfirmToggleStatus}
                >
                  {clientToToggle.status === 'active' ? 'Деактивувати' : 'Активувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showViewModal && selectedClient && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Карточка клієнта: {selectedClient.legal_name}</h3>
              <button className="modal-close" onClick={() => setShowViewModal(false)}>
                ×
              </button>
            </div>
            <div className="project-card">
              <div className="card-section">
                <h4>Основна інформація</h4>
                <div className="card-row">
                  <div className="card-field">
                    <label>ЕДРПОУ:</label>
                    <span>{selectedClient.edrpou || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Юр. назва:</label>
                    <span>{selectedClient.legal_name}</span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Телефон:</label>
                    <span>{selectedClient.phone || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Email:</label>
                    <span>{selectedClient.email || '-'}</span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Статус:</label>
                    <span className={`status-badge ${selectedClient.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                      {selectedClient.status === 'active' ? 'Активний' : selectedClient.status === 'inactive' ? 'Неактивний' : 'Не вказано'}
                    </span>
                  </div>
                  <div className="card-field">
                    <label>Група компаній:</label>
                    <span>{selectedClient.company_group || '-'}</span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Вартість обслуговування:</label>
                    <span>{formatCurrency(selectedClient.service_cost)}</span>
                  </div>
                  <div className="card-field">
                    <label>Дата створення:</label>
                    <span>{formatDate(selectedClient.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h4>Адреса</h4>
                <div className="card-row">
                  <div className="card-field">
                    <label>Місто:</label>
                    <span>{selectedClient.city || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Адреса:</label>
                    <span>{selectedClient.address || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h4>Діяльність</h4>
                <div className="card-row">
                  <div className="card-field">
                    <label>КВЕД:</label>
                    <span>{selectedClient.kved ? `${selectedClient.kved.code} - ${selectedClient.kved.description}` : '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Вид діяльності:</label>
                    <span>{selectedClient.activity_type || '-'}</span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Тип:</label>
                    <span>{selectedClient.type || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h4>Керівництво</h4>
                <div className="card-row">
                  <div className="card-field">
                    <label>ПІБ директора:</label>
                    <span>{selectedClient.director_full_name || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Стать:</label>
                    <span>
                      {selectedClient.gender === 'male' ? 'Чоловік' : 
                       selectedClient.gender === 'female' ? 'Жінка' : '-'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h4>Банківські реквізити</h4>
                <div className="card-row">
                  <div className="card-field">
                    <label>IBAN:</label>
                    <span>{selectedClient.iban || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Назва банку:</label>
                    <span>{selectedClient.bank_name || '-'}</span>
                  </div>
                </div>
              </div>

              {selectedClient.departments && selectedClient.departments.length > 0 && (
                <div className="card-section">
                  <h4>Відділи обслуговування</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedClient.departments.map((dept) => (
                      <span 
                        key={dept.id}
                        className="status-badge"
                        style={{ 
                          background: '#e6f2ff', 
                          color: '#2c5282',
                          fontSize: '12px',
                          padding: '6px 12px'
                        }}
                      >
                        {dept.department_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedClient.employees && selectedClient.employees.length > 0 && (
                <div className="card-section">
                  <h4>Закріплені працівники</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedClient.employees.map((emp) => {
                      const fullName = [emp.surname, emp.name, emp.middle_name].filter(Boolean).join(' ') || '-'
                      return (
                        <span 
                          key={emp.id}
                          className="status-badge"
                          style={{ 
                            background: '#f0f4ff', 
                            color: '#4c51bf',
                            fontSize: '12px',
                            padding: '6px 12px'
                          }}
                        >
                          {fullName}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowViewModal(false)}>
                  Закрити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

