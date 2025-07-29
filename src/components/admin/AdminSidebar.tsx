import { 
  Users, 
  Tags, 
  FileText, 
  BarChart3, 
  Settings, 
  Database,
  Shield,
  LogOut
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';

const adminItems = [
  { title: 'Dashboard', url: '/admin', icon: BarChart3 },
  { title: 'Usuarios', url: '/admin/users', icon: Users },
  { title: 'Categorías', url: '/admin/categories', icon: Tags },
  { title: 'Documentos', url: '/admin/documents', icon: FileText },
  { title: 'Métricas', url: '/admin/metrics', icon: BarChart3 },
  { title: 'Sistema', url: '/admin/system', icon: Database },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const currentPath = location.pathname;

  const isActive = (path: string) => {
    if (path === '/admin') {
      return currentPath === '/admin';
    }
    return currentPath.startsWith(path);
  };

  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive 
      ? "bg-admin-primary text-admin-primary-foreground font-medium" 
      : "hover:bg-sidebar-accent text-sidebar-foreground";

  return (
    <Sidebar className={collapsed ? "w-14" : "w-64"}>
      <SidebarContent className="bg-sidebar">
        {/* Logo/Brand */}
        <div className="p-4 border-b border-sidebar-border">
          {!collapsed ? (
            <div className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-admin-primary" />
              <span className="text-lg font-bold text-sidebar-foreground">QAMIRI Admin</span>
            </div>
          ) : (
            <Shield className="h-8 w-8 text-admin-primary mx-auto" />
          )}
        </div>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-sidebar-foreground/60">
            {!collapsed && 'Administración'}
          </SidebarGroupLabel>
          
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end={item.url === '/admin'}
                      className={({ isActive }) => getNavCls({ isActive })}
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* User Info & Logout */}
        <div className="mt-auto p-4 border-t border-sidebar-border">
          {!collapsed && (
            <div className="mb-3 text-xs text-sidebar-foreground/60">
              <div className="font-medium">{profile?.full_name}</div>
              <div className="text-admin-accent">{profile?.role}</div>
            </div>
          )}
          
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} className="w-full hover:bg-destructive hover:text-destructive-foreground">
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Cerrar Sesión</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}