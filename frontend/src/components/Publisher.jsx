import React from 'react';
import usePublisher from './publisher/usePublisher';
import PublisherCalendar from './publisher/PublisherCalendar';
import ConnectedAccountsTab from './publisher/ConnectedAccountsTab';
import BulkScheduleModal from './publisher/BulkScheduleModal';
import ConfirmModal from './ConfirmModal';

export default function Publisher({ triggerToast }) {
  const pubState = usePublisher(triggerToast);
  const { bulkModalOpen, setBulkModalOpen, bulkModalInitialDate } = pubState;

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
    <div className="w-full flex flex-col fade-in h-full relative gap-4">
      {/* Main Content Area — Calendário sempre visível */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <PublisherCalendar pubState={pubState} />
      </div>

      {/* Modal de Perfis Conectados */}
      <ConnectedAccountsTab
        isModal={true}
        isOpen={pubState.accountsModalOpen}
        onClose={() => pubState.setAccountsModalOpen(false)}
        pubState={pubState}
        triggerToast={triggerToast}
      />

      {/* Modal de Agendamento em Sobreposição (Lote e Individual) */}
      <BulkScheduleModal
        isOpen={bulkModalOpen}
        initialDate={bulkModalInitialDate}
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
