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
    }
  }
}
