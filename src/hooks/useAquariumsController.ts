import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  createAquarium,
  prepareAquariumDeletion,
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
  buildAquariumUpdatePayload,
  buildOwnerGroups,
  createEmptyAquariumForm,
  getDeleteErrorMessage,
  getLoadErrorMessage,
  getSaveErrorMessage,
  populateAquariumForm,
  validateAquariumForm,
} from '../utils/aquariumManagementHelpers';
import { resizeFishWeights } from '../utils/aquariumProfileCalculations';

export function useAquariumsController() {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('User');
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
    const loadTimer = window.setTimeout(() => {
      void loadAquariums();
    }, 0);

    return () => window.clearTimeout(loadTimer);
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
    setError('');
    setFormData((prev) => {
      if (field !== 'fishCount' || typeof value !== 'string') {
        return { ...prev, [field]: value };
      }

      const nextCount = Number(value);
      if (!Number.isInteger(nextCount) || nextCount <= 0) {
        return { ...prev, fishCount: value };
      }

      if (
        nextCount < prev.fishWeightsG.length &&
        prev.fishWeightsG.slice(nextCount).some((weight) => weight.trim()) &&
        !window.confirm(
          'Reducing the fish quantity will remove the extra saved weight entries. Continue?'
        )
      ) {
        return prev;
      }

      return {
        ...prev,
        fishCount: value,
        fishWeightsG: resizeFishWeights(prev.fishWeightsG, nextCount),
      };
    });
  };

  const updateFishWeight = (index: number, value: string) => {
    setError('');
    setFormData((prev) => ({
      ...prev,
      fishWeightsG: prev.fishWeightsG.map((weight, weightIndex) =>
        weightIndex === index ? value : weight
      ),
    }));
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
        await createAquarium(buildAquariumUpdatePayload(formData), {
          deviceId: formData.deviceId,
        });
        setSuccess('Device linked and aquarium created successfully. Waiting for live sensor readings.');
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
      const result = await prepareAquariumDeletion(aquariumId);

      if (result.status !== 'prepared') {
        throw new Error('The secure service did not confirm deletion preparation.');
      }

      setSuccess(
        'Aquarium access was revoked and deletion was prepared. Records are retained pending the approved retention process.'
      );
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
      updateFishWeight,
    },
  };
}
