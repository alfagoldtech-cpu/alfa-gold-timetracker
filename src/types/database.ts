export interface Role {
  id: number
  role_name: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: number
  date_added: string
  name: string
  status?: string
  surname?: string
  middle_name?: string
  phone?: string
  company_name?: string
  company_code?: string
  email?: string
  created_at: string
  updated_at: string
}

export interface User {
  id: number
  auth_user_id?: string
  project_id?: number
  role_id: number
  group_id?: number | null
  surname?: string
  name?: string
  middle_name?: string
  phone?: string
  status?: string
  date_added: string
  email?: string
  created_at: string
  updated_at: string
}

export interface Department {
  id: number
  department_name: string
  project_id: number
  created_at: string
  updated_at: string
}

export interface UserDepartment {
  user_id: number
  department_id: number
  created_at: string
}

export interface UserWithDepartments extends User {
  departments?: Department[]
}

export interface Kved {
  id: number
  code: string
  description: string
  created_at: string
  updated_at: string
}

export interface GroupCompany {
  id: number
  group_name: string
  project_id: number
  created_at: string
  updated_at: string
}

export interface Client {
  id: number
  edrpou?: string
  legal_name: string
  phone?: string
  status?: string
  company_group?: string
  group_company_id?: number
  service_cost?: number
  company_folder?: string
  client_card?: string
  address?: string
  city?: string
  kved_id?: number
  activity_type?: string
  email?: string
  type?: string
  director_full_name?: string
  gender?: string
  iban?: string
  bank_name?: string
  created_at: string
  updated_at: string
}

export interface ClientDepartment {
  client_id: number
  department_id: number
  created_at: string
}

export interface ClientEmployee {
  client_id: number
  user_id: number
  created_at: string
}

export interface ClientWithRelations extends Client {
  kved?: Kved
  group_company?: GroupCompany
  departments?: Department[]
  employees?: User[]
}

export interface TaskCategory {
  id: number
  name: string
  project_id: number
  created_at: string
  updated_at: string
}

export interface Task {
  id: number
  project_id: number
  task_name: string
  task_type?: string
  recurrence_type?: string
  category_id?: number
  planned_date: string
  description?: string
  created_at: string
  updated_at: string
}

export interface TaskTimeLog {
  id: number
  assigned_task_id: number
  user_id: number
  start_time: string
  end_time?: string | null
  log_status: 'in_progress' | 'paused' | 'completed'
  duration_minutes?: number | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: Role
        Insert: Omit<Role, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Role, 'id' | 'created_at' | 'updated_at'>>
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>
      }
      users: {
        Row: User
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at' | 'date_added'>
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at' | 'date_added'>>
      }
      departments: {
        Row: Department
        Insert: Omit<Department, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Department, 'id' | 'created_at' | 'updated_at'>>
      }
      user_departments: {
        Row: UserDepartment
        Insert: Omit<UserDepartment, 'created_at'>
        Update: Partial<Omit<UserDepartment, 'created_at'>>
      }
      kveds: {
        Row: Kved
        Insert: Omit<Kved, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Kved, 'id' | 'created_at' | 'updated_at'>>
      }
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>
      }
      client_departments: {
        Row: ClientDepartment
        Insert: Omit<ClientDepartment, 'created_at'>
        Update: Partial<Omit<ClientDepartment, 'created_at'>>
      }
      client_employees: {
        Row: ClientEmployee
        Insert: Omit<ClientEmployee, 'created_at'>
        Update: Partial<Omit<ClientEmployee, 'created_at'>>
      }
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>
      }
      group_company: {
        Row: GroupCompany
        Insert: Omit<GroupCompany, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<GroupCompany, 'id' | 'created_at' | 'updated_at'>>
      }
      task_time_logs: {
        Row: TaskTimeLog
        Insert: Omit<TaskTimeLog, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<TaskTimeLog, 'id' | 'created_at' | 'updated_at'>>
      }
    }
  }
}
