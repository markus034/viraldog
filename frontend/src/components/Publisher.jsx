import React from 'react';
import usePublisher from './publisher/usePublisher';
import PostForm from './publisher/PostForm';
import PublisherCalendar from './publisher/PublisherCalendar';
import PostList from './publisher/PostList';
import RepostPanel from './publisher/RepostPanel';
import DashboardMetrics from './publisher/DashboardMetrics';
import BulkScheduleModal from './publisher/BulkScheduleModal';
import ConfirmModal from './ConfirmModal';

export default function Publisher({ triggerToast }) {
  const pubState = usePublisher(triggerToast);
  const { activeSubTab, setActiveSubTab, creationWizardOpen, setCreationWizardOpen, wizardStep, setWizardStep, bulkModalOpen, setBulkModalOpen } = pubState;

  const deleteModalDetails = pubState.deleteModalPost ? {
    title: pubState.deleteModalPost.video_path
      ? pubState.deleteModalPost.video_path.split(/[\\/]/).pop()
      : (pubState.deleteModalPost.post_type === 'carousel' ? 'Post de Feed (Carrossel)' : 'Publicação Agendada'),
    account: pubState.deleteModalPost.account_username || null,
    time: pubState.deleteModalPost.scheduled_time
      ? new Date(pubState.deleteModalPost.scheduled_time).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      : null,
    type: pubState.deleteModalPost.post_type,
    icon: pubState.deleteModalPost.post_type === 'carousel' ? 'photo_library' : 'movie'
  } : null;

  return (
    <div className={`w-full flex flex-col fade-in h-full relative ${creationWizardOpen ? '' : 'gap-6'}`}>
      {/* Header — hidden during wizard so PostForm fills full height */}
      {!creationWizardOpen && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Publisher Inteligente</h1>
            <p className="text-xs text-text-secondary mt-1">
              Agende, analise e gerencie suas publicações
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 bg-surface-off-white rounded-xl border border-outline-variant/20 shadow-xs self-stretch md:self-auto overflow-x-auto custom-scrollbar no-scrollbar-y">
            {[
              { id: 'calendar', label: 'Calendário', icon: 'calendar_today' },
              { id: 'my-posts', label: 'Meus Posts', icon: 'grid_on' },
              { id: 'approvals', label: 'Grupos e Reposts', icon: 'rule_folder' },
              { id: 'dashboard', label: 'Dashboard', icon: 'donut_large' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveSubTab(tab.id); setCreationWizardOpen(false); setWizardStep(1); }}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
                  activeSubTab === tab.id && !creationWizardOpen
                    ? 'bg-surface-white text-[#0071E3] shadow-sm'
                    : 'text-[#86868B] hover:text-[#1D1D1F]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 min-h-0 ${creationWizardOpen || activeSubTab === 'calendar' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto custom-scrollbar pb-6'}`}>
        {creationWizardOpen ? (
          <PostForm pubState={pubState} triggerToast={triggerToast} />
        ) : (
          <>
            {activeSubTab === 'calendar' && <PublisherCalendar pubState={pubState} />}
            {activeSubTab === 'my-posts' && <PostList pubState={pubState} />}
            {activeSubTab === 'approvals' && <RepostPanel pubState={pubState} />}
            {activeSubTab === 'dashboard' && <DashboardMetrics pubState={pubState} />}
          </>
        )}
      </div>

      {/* Bulk Schedule Modal */}
      <BulkScheduleModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        accounts={pubState.accounts}
        triggerToast={triggerToast}
        onSuccess={() => {
          if (pubState.fetchScheduledPosts) pubState.fetchScheduledPosts();
        }}
      />

      {/* Modern Cancel Post Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(pubState.deleteModalPost)}
        onClose={pubState.closeDeleteModal}
        onConfirm={pubState.confirmDeleteSchedule}
        isLoading={pubState.isDeletingSchedule}
        title="Cancelar Agendamento?"
        description="Esta publicação será removida da fila e não será postada automaticamente no Instagram."
        confirmText="Sim, Cancelar Post"
        cancelText="Manter Agendamento"
        type="danger"
        icon="event_busy"
        itemDetails={deleteModalDetails}
      />
    </div>
  );
}
