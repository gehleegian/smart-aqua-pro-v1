import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  createAquarium,
  deleteAquarium,
  updateAquarium,
} from '../services/aquariumService';
import { getAquariumManagementData } from '../services/aquariumManagementService';
import type { Aquarium } from '../types/aquarium';
import type {
  AquariumFormData,
  AquariumFormMode,
} from '../types/aquariumManagement';
import type { UserRole } from '../types/user';
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

export function useAquariumsController() {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('User');
  const [currentUserName, setCurrentUserName] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [formData, setFormData] = useState<AquariumFormData>(createEmptyAquariumForm);
  const [formMode, setFormMode] = useState<AquariumFormMode>('create');
  const [editingId, setEditingId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const ownerGroups = useMemo(() => buildOwnerGroups(aquariums), [aquariums]);
  const selectedOwnerName = useMemo(
    () => ownerGroups.find((group) => group.ownerId === selectedOwnerId)?.ownerName || '',
    [ownerGroups, selectedOwnerId]
  );
  const visibleAquariums = useMemo(
    () =>
      currentUserRole === 'Admin' && selectedOwnerId
        ? aquariums.filter((aquarium) => aquarium.ownerId === selectedOwnerId)
        : aquariums,
    [aquariums, currentUserRole, selectedOwnerId]
  );

  const loadAquariums = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setAquariums([]);
        return;
      }

      const data = await getAquariumManagementData(currentUser.uid);

      if (!data) {
        setError('User profile not found.');
        setAquariums([]);
        return;
      }

      setCurrentUserRole(data.userProfile.role);
      setCurrentUserName(data.userProfile.name);
      setAquariums(data.aquariums);
      setSelectedOwnerId((prev) =>
        prev && data.aquariums.some((aquarium) => aquarium.ownerId === prev) ? prev : ''
      );
    } catch (loadError) {
      console.error(loadError);
      setError(getLoadErrorMessage(loadError));
      setAquariums([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAquariums();
  }, [loadAquariums]);

  const closeModal = () => {
    setShowModal(false);
    setEditingId('');
    setFormData(createEmptyAquariumForm());
  };

  const openAddModal = () => {
    setFormMode('create');
    setEditingId('');
    setFormData(createEmptyAquariumForm());
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const openEditModal = (aquarium: Aquarium) => {
    setFormMode('edit');
    setEditingId(aquarium.id);
    setFormData(populateAquariumForm(aquarium));
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const updateFormField = <Field extends keyof AquariumFormData>(
    field: Field,
    value: AquariumFormData[Field]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const saveAquarium = async () => {
    const validationError = validateAquariumForm(formData);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (formMode === 'edit' && editingId) {
        await updateAquarium(editingId, buildAquariumUpdatePayload(formData));
        setSuccess('Aquarium updated successfully.');
      } else {
        const ownerId =
          currentUserRole === 'Admin' && selectedOwnerId
            ? selectedOwnerId
            : auth.currentUser?.uid || '';
        const ownerName =
          currentUserRole === 'Admin' && selectedOwnerName
            ? selectedOwnerName
            : currentUserName || 'Current User';

        await createAquarium(buildAquariumCreatePayload({ formData, ownerId, ownerName }));
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
  };

  const removeAquarium = async (aquariumId: string) => {
    try {
      setDeletingId(aquariumId);
      setError('');
      setSuccess('');
      await deleteAquarium(aquariumId);
      setSuccess('Aquarium deleted successfully.');
      await loadAquariums();
    } catch (deleteError) {
      console.error(deleteError);
      setError(getDeleteErrorMessage(deleteError));
    } finally {
      setDeletingId('');
    }
  };

  return {
    currentUserRole,
    deletingId,
    error,
    formData,
    formMode,
    loading,
    ownerGroups,
    saving,
    selectedOwnerId,
    selectedOwnerName,
    showModal,
    success,
    visibleAquariums,
    actions: {
      closeModal,
      openAddModal,
      openEditModal,
      removeAquarium,
      saveAquarium,
      selectOwner: setSelectedOwnerId,
      updateFormField,
    },
  };
}
