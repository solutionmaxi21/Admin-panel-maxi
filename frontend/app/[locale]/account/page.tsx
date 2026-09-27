"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation" 
import { usersApi, type Address } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { toast } from "sonner"
import { User, Mail, Phone, Lock, MapPin, Plus, Edit, Trash2, Home } from "lucide-react"
import { useLanguage } from "@/lib/language-context"

import { useProtectedRoute } from "@/hooks/useProtectedRoute"

export default function AccountPage() {
  const { isLoading: authLoading, authState } = useProtectedRoute()
  const { user, updateUser } = useAuth()
  const router = useRouter()
  const { t, language } = useLanguage()
  const [isLoading, setIsLoading] = useState(false)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [addressToDelete, setAddressToDelete] = useState<number | null>(null)
  const [errorDialog, setErrorDialog] = useState<{ open: boolean; title: string; description: string } | null>(null)




  // Profile form state
 const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  })

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  // Address form state
  const [addressForm, setAddressForm] = useState({
    firstName: "",
    lastName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "Algeria",
    phone: "",
    isDefault: false,
  })

  useEffect(() => {
    if (user) {
      setProfileForm({
           firstName: user.firstName || "",
        lastName: user.lastName || "",
        phone: user.phone || "",
      })
      loadAddresses()
    }
  }, [user])

  const loadAddresses = async () => {
    try {
      const data = await usersApi.getAddresses()
      setAddresses(data || [])
    } catch (error) {
      console.error("Failed to load addresses:", error)
      setAddresses([])
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
     const cleanPhone = profileForm.phone.replace(/\s/g, '')
    
    // 2. Regex for Algerian Numbers (05, 06, 07 followed by 8 digits)
    const phoneRegex = /^(05|06|07)[0-9]{8}$/

    // 3. Check if phone is not empty and invalid
    if (cleanPhone && !phoneRegex.test(cleanPhone)) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: language === 'ar' 
          ? "رقم الهاتف غير صالح (مثال: 0550123456)" 
          : "Numéro de téléphone invalide (ex: 05 50 12 34 56)",
      })
      return
    }
    setIsLoading(true)
    try {
     const updatedUser = await usersApi.updateProfile({
        ...profileForm,
        phone: cleanPhone // Send the clean version to backend
      })   
        updateUser(updatedUser)
      toast.success(t.accountPage.toasts.profileSuccess)
    } catch (error: any) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: error.message || t.accountPage.toasts.profileError,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: t.accountPage.toasts.pwdMismatch,
      })
      return
    }

    if (passwordForm.newPassword.length < 6) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: t.accountPage.toasts.pwdLength,
      })
      return
    }

    setIsLoading(true)
    try {
      await usersApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      toast.success(t.accountPage.toasts.pwdSuccess)
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
    } catch (error: any) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: error.message || t.accountPage.toasts.pwdError,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      if (editingAddress) {
        await usersApi.updateAddress(editingAddress.id, addressForm)
        toast.success(t.accountPage.toasts.addrUpdateSuccess)
      } else {
        await usersApi.addAddress(addressForm)
        toast.success(t.accountPage.toasts.addrAddSuccess)
      }
      await loadAddresses()
      setIsAddressDialogOpen(false)
      resetAddressForm()
    } catch (error: any) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: error.message || t.accountPage.toasts.addrError,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteAddress = async (id: number) => {
    setAddressToDelete(id)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteAddress = async () => {
    if (!addressToDelete) return

    try {
      await usersApi.deleteAddress(addressToDelete)
      toast.success(t.accountPage.toasts.addrDeleteSuccess)
      await loadAddresses()
    } catch (error: any) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: error.message || t.accountPage.toasts.addrDeleteError,
      })
    } finally {
      setDeleteDialogOpen(false)
      setAddressToDelete(null)
    }
  }

  const handleSetDefaultAddress = async (id: number) => {
    try {
      await usersApi.setDefaultAddress(id)
      toast.success(t.accountPage.toasts.addrUpdateSuccess)
      await loadAddresses()
    } catch (error: any) {
      setErrorDialog({
        open: true,
        title: t.alertDialogs.accountError.title,
        description: error.message || t.accountPage.toasts.addrError,
      })
    }
  }

  const openAddressDialog = (address?: Address) => {
    if (address) {
      setEditingAddress(address)
      setAddressForm({
        firstName: address.firstName,
        lastName: address.lastName,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || "",
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
        phone: address.phone,
        isDefault: address.isDefault,
      })
    } else {
      resetAddressForm()
    }
    setIsAddressDialogOpen(true)
  }

  const resetAddressForm = () => {
    setEditingAddress(null)
    setAddressForm({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "Algeria",
      phone: user?.phone || "",
      isDefault: false,
    })
  }

 if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </main>
        <Footer />
      </div>
    )
  }

  // If redirected, return null to prevent flash of content
  if (!user) return null;

  const inputIconClass = `absolute top-3 h-4 w-4 text-muted-foreground ${language === 'ar' ? 'right-3' : 'left-3'}`
  const inputClass = language === 'ar' ? 'pr-9' : 'pl-9'

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">{t.account.title}</h1>
            <p className="text-muted-foreground mt-2">{t.accountPage.subtitle}</p>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="profile">{t.accountPage.tabs.profile}</TabsTrigger>
              <TabsTrigger value="security">{t.accountPage.tabs.security}</TabsTrigger>
              <TabsTrigger value="addresses">{t.accountPage.tabs.addresses}</TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>{t.accountPage.profile.title}</CardTitle>
                  <CardDescription>{t.accountPage.profile.subtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProfileUpdate} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">{t.accountPage.profile.firstName}</Label>
                        <div className="relative">
                          <User className={inputIconClass} />
                          <Input
                            id="firstName"
                            value={profileForm.firstName}
                            onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                            className={inputClass}
                            style={{ direction: 'ltr', textAlign: 'left' }}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">{t.accountPage.profile.lastName}</Label>
                        <div className="relative">
                          <User className={inputIconClass} />
                          <Input
                            id="lastName"
                            value={profileForm.lastName}
                            onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                            className={inputClass}
                            style={{ direction: 'ltr', textAlign: 'left' }}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">{t.accountPage.profile.email}</Label>
                      <div className="relative">
                        <Mail className={inputIconClass} />
                        <Input
                          id="email"
                          type="email"
                          value={user.email}
                          disabled
                          className={`${inputClass} bg-muted`}
                          style={{ direction: 'ltr', textAlign: 'left' }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{t.accountPage.profile.emailNote}</p>
                    </div>

                  <div className="space-y-2">
                      <Label htmlFor="phone">{t.accountPage.profile.phone}</Label>
                      <div className="relative">
                        <Phone className={inputIconClass} />
                        <Input
                          id="phone"
                          type="tel"
                          // === CRITICAL: Ensure this value is correct ===
                          value={profileForm.phone} 
                          onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                          className={inputClass}
                          placeholder="+213 XXX XXX XXX"
                          style={{ direction: 'ltr', textAlign: 'left' }}
                        />
                      </div>
                    </div>

                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? t.accountPage.profile.saving : t.accountPage.profile.save}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security">
              <Card>
                <CardHeader>
                  <CardTitle>{t.accountPage.security.title}</CardTitle>
                  <CardDescription>{t.accountPage.security.subtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">{t.accountPage.security.currentPwd}</Label>
                      <div className="relative">
                        <Lock className={inputIconClass} />
                        <Input
                          id="currentPassword"
                          type="password"
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                          className={inputClass}
                          required
                          style={{ direction: 'ltr', textAlign: 'left' }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="newPassword">{t.accountPage.security.newPwd}</Label>
                      <div className="relative">
                        <Lock className={inputIconClass} />
                        <Input
                          id="newPassword"
                          type="password"
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                          className={inputClass}
                          required
                          style={{ direction: 'ltr', textAlign: 'left' }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{t.accountPage.security.pwdHint}</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">{t.accountPage.security.confirmPwd}</Label>
                      <div className="relative">
                        <Lock className={inputIconClass} />
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                          className={inputClass}
                          required
                          style={{ direction: 'ltr', textAlign: 'left' }}
                        />
                      </div>
                    </div>

                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? t.accountPage.security.changing : t.accountPage.security.changeBtn}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Addresses Tab */}
            <TabsContent value="addresses">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{t.accountPage.addresses.title}</CardTitle>
                      <CardDescription>{t.accountPage.addresses.subtitle}</CardDescription>
                    </div>
                    <Dialog open={isAddressDialogOpen} onOpenChange={setIsAddressDialogOpen}>
                      <DialogTrigger asChild>
                        <Button onClick={() => openAddressDialog()}>
                          <Plus className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                          {t.accountPage.addresses.addBtn}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editingAddress ? t.accountPage.addressForm.editTitle : t.accountPage.addressForm.addTitle}</DialogTitle>
                          <DialogDescription>
                            {editingAddress ? t.accountPage.addressForm.editSubtitle : t.accountPage.addressForm.addSubtitle}
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleAddressSubmit} className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="addrFirstName">{t.accountPage.profile.firstName}</Label>
                              <Input
                                id="addrFirstName"
                                value={addressForm.firstName}
                                onChange={(e) => setAddressForm({ ...addressForm, firstName: e.target.value })}
                                required
                                style={{ direction: 'ltr', textAlign: 'left' }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="addrLastName">{t.accountPage.profile.lastName}</Label>
                              <Input
                                id="addrLastName"
                                value={addressForm.lastName}
                                onChange={(e) => setAddressForm({ ...addressForm, lastName: e.target.value })}
                                required
                                style={{ direction: 'ltr', textAlign: 'left' }}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="addressLine1">{t.accountPage.addressForm.line1}</Label>
                            <Input
                              id="addressLine1"
                              value={addressForm.addressLine1}
                              onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
                              placeholder={t.checkout.address}
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="addressLine2">{t.accountPage.addressForm.line2}</Label>
                            <Input
                              id="addressLine2"
                              value={addressForm.addressLine2}
                              onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })}
                              placeholder={t.accountPage.addressForm.line2}
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="city">{t.accountPage.addressForm.city}</Label>
                              <Input
                                id="city"
                                value={addressForm.city}
                                onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="state">{t.accountPage.addressForm.state}</Label>
                              <Input
                                id="state"
                                value={addressForm.state}
                                onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                                placeholder={t.accountPage.addressForm.statePlaceholder}
                                required
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="postalCode">{t.accountPage.addressForm.postalCode}</Label>
                              <Input
                                id="postalCode"
                                value={addressForm.postalCode}
                                onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                                required
                                style={{ direction: 'ltr', textAlign: 'left' }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="country">{t.accountPage.addressForm.country}</Label>
                              <Input
                                id="country"
                                value={addressForm.country}
                                onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                                required
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="addrPhone">{t.accountPage.profile.phone}</Label>
                            <Input
                              id="addrPhone"
                              type="tel"
                              value={addressForm.phone}
                              onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                              placeholder="+213 XXX XXX XXX"
                              required
                              style={{ direction: 'ltr', textAlign: 'left' }}
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="isDefault"
                              checked={addressForm.isDefault}
                              onCheckedChange={(checked) => setAddressForm({ ...addressForm, isDefault: checked as boolean })}
                            />
                            <label
                              htmlFor="isDefault"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {t.accountPage.addressForm.default}
                            </label>
                          </div>

                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsAddressDialogOpen(false)}>
                              {t.common.cancel}
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                              {isLoading ? t.accountPage.profile.saving : editingAddress ? t.accountPage.addressForm.update : t.accountPage.addresses.addBtn}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {addresses.length === 0 ? (
                    <div className="text-center py-8">
                      <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">{t.accountPage.addresses.noAddresses}</p>
                      <p className="text-sm text-muted-foreground mt-2">{t.accountPage.addresses.addFirst}</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {addresses.map((address) => (
                        <Card key={address.id} className={address.isDefault ? "border-primary" : ""}>
                          <CardContent className="pt-6">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                {address.isDefault && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                                    <Home className="h-3 w-3" />
                                    {t.accountPage.addressForm.defaultLabel}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openAddressDialog(address)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteAddress(address.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="font-semibold">{address.firstName} {address.lastName}</p>
                              <p>{address.addressLine1}</p>
                              {address.addressLine2 && <p>{address.addressLine2}</p>}
                              <p>{address.city}, {address.state} {address.postalCode}</p>
                              <p>{address.country}</p>
                              <p className="flex items-center gap-1 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span style={{ direction: 'ltr' }}>{address.phone}</span>
                              </p>
                            </div>
                            {!address.isDefault && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-4 w-full"
                                onClick={() => handleSetDefaultAddress(address.id)}
                              >
                                {t.accountPage.addressForm.default}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />

      {/* Delete Address AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.alertDialogs.deleteAddress.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.alertDialogs.deleteAddress.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.alertDialogs.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAddress}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.alertDialogs.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {errorDialog && (
        <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog(open ? errorDialog : null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{errorDialog.title}</AlertDialogTitle>
              <AlertDialogDescription>{errorDialog.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setErrorDialog(null)}>
                {t.alertDialogs.common.ok}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
