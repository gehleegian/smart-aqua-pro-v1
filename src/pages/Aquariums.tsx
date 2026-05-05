import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Plus, Fish, Thermometer, Droplets, Waves, X, Pencil, Trash2, Users } from 'lucide-react';
import { auth } from '../firebase';
import { getCurrentUserProfile } from '../services/userService';
import {
  getAllAquariums,
  getAquariumsByOwner,
  getAquariumById,
  createAquarium,
  updateAquarium,
  deleteAquarium,
} from '../services/aquariumService';
import type { Aquarium } from '../types/aquarium';
import type { UserRole } from '../types/user';

type OwnerGroup = {
  ownerId: string;
  ownerName: string;
  aquariums: Aquarium[];
};

export default function Aquariums() {
  const [aquariumList, setAquariumList] = useState<Aquarium[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState('');

  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [bioload, setBioload] = useState<'low' | 'medium' | 'high'>('low');
  const [minTemp, setMinTemp] = useState('');
  const [maxTemp, setMaxTemp] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('User');
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');

  const loadAquariums = async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setAquariumList([]);
        return;
      }

      setCurrentUserId(currentUser.uid);

      const userProfile = await getCurrentUserProfile(currentUser.uid);

      if (!userProfile) {
        setError('User profile not found.');
        setAquariumList([]);
        return;
      }

      setCurrentUserRole(userProfile.role);
      setCurrentUserName(userProfile.name);

      const aquariums =
        userProfile.role === 'Admin'
          ? await getAllAquariums()
          : await getAquariumsByOwner(currentUser.uid);

      setAquariumList(aquariums);

      if (userProfile.role !== 'Admin') {
        setSelectedOwnerId(currentUser.uid);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load aquariums.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAquariums();
  }, []);

  const ownerGroups = useMemo<OwnerGroup[]>(() => {
    const groupsMap = new Map<string, OwnerGroup>();

    for (const aquarium of aquariumList) {
      const key = aquarium.ownerId || 'unknown';

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          ownerId: aquarium.ownerId || '',
          ownerName: aquarium.ownerName || 'Unknown Owner',
          aquariums: [],
        });
      }

      groupsMap.get(key)?.aquariums.push(aquarium);
    }

    return Array.from(groupsMap.values()).sort((a, b) =>
      a.ownerName.localeCompare(b.ownerName)
    );
  }, [aquariumList]);

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

  const resetForm = () => {
    setName('');
    setSpecies('');
    setBioload('low');
    setMinTemp('');
    setMaxTemp('');
    setEditingId('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const handleEdit = (aq: Aquarium) => {
    const isOwner = aq.ownerId === currentUserId;
    const isAdmin = currentUserRole === 'Admin';

    if (!isOwner && !isAdmin) {
      setError('You are not allowed to edit this aquarium.');
      return;
    }

    setEditingId(aq.id);
    setName(aq.name);
    setSpecies(aq.species.join(', '));
    setBioload(aq.bioload);
    setMinTemp(String(aq.minTemp));
    setMaxTemp(String(aq.maxTemp));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name || !species || !minTemp || !maxTemp) {
      setError('Please fill in all fields.');
      return;
    }

    if (Number(minTemp) > Number(maxTemp)) {
      setError('Minimum temperature cannot be greater than maximum temperature.');
      return;
    }

    try {
      setError('');
      setSuccess('');

      const payload = {
        name,
        species: species
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        bioload,
        minTemp: Number(minTemp),
        maxTemp: Number(maxTemp),
        temp: Number(minTemp),
        level: 100,
        quality: 100,
        feeder: 'Active',
        light: 'On',
        filter: 'Active',
        ownerId: currentUserId,
        ownerName: currentUserName,
      };

      if (editingId) {
        const aquariumData = await getAquariumById(editingId);

        if (!aquariumData) {
          setError('Aquarium not found.');
          return;
        }

        const isOwner = aquariumData.ownerId === currentUserId;
        const isAdmin = currentUserRole === 'Admin';

        if (!isOwner && !isAdmin) {
          setError('You are not allowed to update this aquarium.');
          return;
        }

        await updateAquarium(editingId, {
          name: payload.name,
          species: payload.species,
          bioload: payload.bioload,
          minTemp: payload.minTemp,
          maxTemp: payload.maxTemp,
          temp: payload.temp,
          level: payload.level,
          quality: payload.quality,
          feeder: payload.feeder,
          light: payload.light,
          filter: payload.filter,
        });

        setSuccess('Aquarium updated successfully.');
      } else {
        await createAquarium(payload);
        setSuccess('Aquarium added successfully.');
      }

      resetForm();
      setShowModal(false);
      await loadAquariums();
    } catch (err) {
      console.error(err);
      setError('Failed to save aquarium.');
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this aquarium?');
    if (!confirmed) return;

    try {
      setError('');
      setSuccess('');

      const aquariumData = await getAquariumById(id);

      if (!aquariumData) {
        setError('Aquarium not found.');
        return;
      }

      const isOwner = aquariumData.ownerId === currentUserId;
      const isAdmin = currentUserRole === 'Admin';

      if (!isOwner && !isAdmin) {
        setError('You are not allowed to delete this aquarium.');
        return;
      }

      await deleteAquarium(id);
      setSuccess('Aquarium deleted successfully.');
      await loadAquariums();
    } catch (err) {
      console.error(err);
      setError('Failed to delete aquarium.');
    }
  };

  return (
    <div className="space-y-6">
      {(error || success) && (
        <div className="space-y-3">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
              {success}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-slate-400">Manage and configure your aquariums</p>
          <p className="text-xs text-slate-500 mt-1">
            {currentUserRole === 'Admin'
              ? 'Admin view: select an owner to view that user’s aquariums'
              : 'User view: you can only see your own aquarium records'}
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-600/20"
        >
          <Plus className="w-4 h-4" />
          Add Aquarium
        </button>
      </div>

      {currentUserRole === 'Admin' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Aquarium Owners</h3>
            </div>
          </CardHeader>
          <CardContent>
            {ownerGroups.length === 0 ? (
              <p className="text-slate-400">No aquarium owners found.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ownerGroups.map((group) => (
                  <button
                    key={group.ownerId}
                    onClick={() => setSelectedOwnerId(group.ownerId)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedOwnerId === group.ownerId
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {group.ownerName} ({group.aquariums.length})
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {currentUserRole === 'Admin' && selectedOwnerName && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
          <p className="text-sm text-slate-400">Showing aquariums for</p>
          <p className="text-base font-semibold text-white">{selectedOwnerName}</p>
        </div>
      )}

      {loading ? (
        <div className="text-slate-300">Loading aquariums...</div>
      ) : visibleAquariums.length === 0 ? (
        <div className="text-slate-300">
          {currentUserRole === 'Admin'
            ? 'No aquariums found for the selected user.'
            : 'No aquariums found yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visibleAquariums.map((aq) => (
            <Card key={aq.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                      <Fish className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{aq.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {aq.species.map((item) => (
                          <span
                            key={item}
                            className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-slate-400"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                      {currentUserRole === 'Admin' && (
                        <p className="text-xs text-slate-500 mt-2">Owner: {aq.ownerName}</p>
                      )}
                    </div>
                  </div>

                  <Badge
                    variant={
                      aq.bioload === 'high'
                        ? 'danger'
                        : aq.bioload === 'medium'
                        ? 'warning'
                        : 'success'
                    }
                  >
                    {aq.bioload} bioload
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <Thermometer className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{aq.temp}°C</p>
                    <p className="text-xs text-slate-500">Temperature</p>
                  </div>
                  <div className="text-center">
                    <Droplets className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{aq.level}%</p>
                    <p className="text-xs text-slate-500">Water Level</p>
                  </div>
                  <div className="text-center">
                    <Waves className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-white">{aq.quality}%</p>
                    <p className="text-xs text-slate-500">Quality</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <Badge variant={aq.feeder === 'Active' ? 'success' : 'default'}>
                    Feeder: {aq.feeder}
                  </Badge>
                  <Badge variant={aq.light === 'On' ? 'info' : 'default'}>
                    Light: {aq.light}
                  </Badge>
                  <Badge variant={aq.filter === 'Active' ? 'success' : 'default'}>
                    Filter: {aq.filter}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(aq)}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(aq.id)}
                    className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">
                {editingId ? 'Edit Aquarium' : 'Add New Aquarium'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Aquarium Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Tropical Tank E"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Fish Species
                </label>
                <input
                  type="text"
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  placeholder="e.g., Guppies, Tetras"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Bioload Classification
                </label>
                <select
                  value={bioload}
                  onChange={(e) => setBioload(e.target.value as 'low' | 'medium' | 'high')}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="low">Low - Small, clean species</option>
                  <option value="medium">Medium - Moderate waste</option>
                  <option value="high">High - Large/messy fish</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Min Temp (°C)
                  </label>
                  <input
                    type="number"
                    value={minTemp}
                    onChange={(e) => setMinTemp(e.target.value)}
                    placeholder="24"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Max Temp (°C)
                  </label>
                  <input
                    type="number"
                    value={maxTemp}
                    onChange={(e) => setMaxTemp(e.target.value)}
                    placeholder="28"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-all"
                >
                  Cancel
                </button>

                <button
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all"
                >
                  {editingId ? 'Update Aquarium' : 'Add Aquarium'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}