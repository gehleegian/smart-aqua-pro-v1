import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../services/firebase';
import { createAquarium, deleteAquarium, updateAquarium } from '../services/aquariumService';
import { getAquariumManagementData } from '../services/aquariumManagementService';
import type { Aquarium } from '../types/aquarium';
import type { AquariumFormData, AquariumFormMode } from '../types/aquariumManagement';
import type { UserRole } from '@smartaqua/shared';
import {
  buildAquariumCreatePayload,
  buildAquariumUpdatePayload,
  buildOwnerGroups,
  createEmptyAquariumForm,
  getDeleteErrorMessage,
  getLoadErrorMessage,
  getSaveErrorMessage,
  populateAquariumForm,
  validateAquariumForm,
} from '../utils/aquariumManagementHelpers';

export function useAquariumsScreen() {
  const [aquariumList, setAquariumList] = useState<Aquarium[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingAquariumId, setEditingAquariumId] = useState('');
  const [formData, setFormData] = useState<AquariumFormData>(createEmptyAquariumForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [pendingDeleteAquarium, setPendingDeleteAquarium] = useState<Aquarium | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('User');
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');

  const resetForm = useCallback(() => {
    setFormData(createEmptyAquariumForm());
    setEditingAquariumId('');
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    resetForm();
  }, [resetForm]);

  const loadAquariums = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setAquariumList([]);
        return;
      }

      const data = await getAquariumManagementData(currentUser.uid);

      if (!data) {
        setError('User profile not found.');
        setAquariumList([]);
        return;
      }

      setCurrentUserId(currentUser.uid);
      setCurrentUserRole(data.userProfile.role);
      setCurrentUserName(data.userProfile.name);
      setAquariumList(data.aquariums);

      if (data.userProfile.role !== 'Admin') {
        setSelectedOwnerId(data.userProfile.id || currentUser.uid);
      }
    } catch (loadError) {
      console.error(loadError);
      setError(getLoadErrorMessage(loadError));
      setAquariumList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAquariums();
  }, [loadAquariums]);

  const ownerGroups = useMemo(() => buildOwnerGroups(aquariumList), [aquariumList]);

  useEffect(() => {
    if (currentUserRole !== 'Admin') {
      return;
    }

    if (ownerGroups.length === 0) {
      setSelectedOwnerId('');
      return;
    }

    if (!selectedOwnerId || !ownerGroups.some((group) => group.ownerId === selectedOwnerId)) {
      setSelectedOwnerId(ownerGroups[0].ownerId);
    }
  }, [currentUserRole, ownerGroups, selectedOwnerId]);

  const visibleAquariums = useMemo(() => {
    if (currentUserRole !== 'Admin') {
      return aquariumList;
    }

    if (!selectedOwnerId) {
      return [];
    }

    return aquariumList.filter((aquarium) => aquarium.ownerId === selectedOwnerId);
  }, [aquariumList, currentUserRole, selectedOwnerId]);

  const selectedOwnerName = useMemo(() => {
    if (currentUserRole !== 'Admin') {
      return currentUserName;
    }

    return ownerGroups.find((group) => group.ownerId === selectedOwnerId)?.ownerName || '';
  }, [currentUserRole, currentUserName, ownerGroups, selectedOwnerId]);

  const formMode: AquariumFormMode = editingAquariumId ? 'edit' : 'create';

  const openAddModal = useCallback(() => {
    resetForm();
    setError('');
    setSuccess('');
    setShowModal(true);
  }, [resetForm]);

  const openEditModal = useCallback((aquarium: Aquarium) => {
    setEditingAquariumId(aquarium.id);
    setFormData(populateAquariumForm(aquarium));
    setError('');
    setSuccess('');
    setShowModal(true);
  }, []);

  const updateFormField = useCallback(
    <Field extends keyof AquariumFormData>(field: Field, value: AquariumFormData[Field]) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    []
  );

  const saveAquarium = useCallback(async () => {
    const validationError = validateAquariumForm(formData);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const ownerId = currentUserRole === 'Admin' && selectedOwnerId ? selectedOwnerId : currentUserId;
      const ownerName =
        currentUserRole === 'Admin' && selectedOwnerName ? selectedOwnerName : currentUserName;

      if (editingAquariumId) {
        await updateAquarium(editingAquariumId, buildAquariumUpdatePayload(formData));
        setSuccess('Aquarium updated successfully.');
      } else {
        await createAquarium(
          buildAquariumCreatePayload({
            formData,
            ownerId,
            ownerName,
          })
        );
        setSuccess('Aquarium added successfully.');
      }

      closeModal();
      await loadAquariums();
    } catch (saveError) {
      console.error(saveError);
      setError(getSaveErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [
    closeModal,
    currentUserId,
    currentUserName,
    currentUserRole,
    editingAquariumId,
    formData,
    loadAquariums,
    selectedOwnerId,
    selectedOwnerName,
  ]);

  const requestDeleteAquarium = useCallback((aquarium: Aquarium) => {
    setPendingDeleteAquarium(aquarium);
    setError('');
    setSuccess('');
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setPendingDeleteAquarium(null);
  }, []);

  const confirmDeleteAquarium = useCallback(async () => {
    if (!pendingDeleteAquarium) {
      return;
    }

    try {
      setDeletingId(pendingDeleteAquarium.id);
      setError('');
      setSuccess('');

      await deleteAquarium(pendingDeleteAquarium.id);
      setSuccess('Aquarium deleted successfully.');
      setPendingDeleteAquarium(null);
      await loadAquariums();
    } catch (deleteError) {
      console.error(deleteError);
      setError(getDeleteErrorMessage(deleteError));
    } finally {
      setDeletingId('');
    }
  }, [loadAquariums, pendingDeleteAquarium]);

  return {
    aquariumList,
    ownerGroups,
    visibleAquariums,
    selectedOwnerId,
    selectedOwnerName,
    currentUserRole,
    currentUserName,
    loading,
    saving,
    deletingId,
    pendingDeleteAquarium,
    error,
    success,
    showModal,
    formData,
    formMode,
    actions: {
      loadAquariums,
      selectOwner: setSelectedOwnerId,
      openAddModal,
      openEditModal,
      closeModal,
      updateFormField,
      saveAquarium,
      requestDeleteAquarium,
      closeDeleteConfirm,
      confirmDeleteAquarium,
      clearMessages: () => {
        setError('');
        setSuccess('');
      },
    },
  };
}
