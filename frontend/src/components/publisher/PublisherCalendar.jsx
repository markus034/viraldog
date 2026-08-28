import React from 'react';
import { getDaysOfWeek, getDaysOfMonthGrid, isToday, getMonthYearLabel } from './calendarHelpers';
import { PostCard, MonthlyPostPill } from './PublisherParts';
import CustomSelect from '../CustomSelect';

const API = 'http://localhost:8000';

export default function PublisherCalendar({ pubState }) {
  const {
    calendarView, setCalendarView,
    currentDate, handlePrevDate, handleTodayDate, handleNextDate,
    selectedFilterAccount, setSelectedFilterAccount,
    selectedFilterFormat, setSelectedFilterFormat,
    accounts, setCreationWizardOpen, setWizardStep,
    getPostsForDay, handleDayClick, handleDeleteSchedule, handleRetrySchedule,
    scheduledPosts
  } = pubState;

  const daysOfMonth = getDaysOfMonthGrid(currentDate);
  const monthRowCount = daysOfMonth.length / 7;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-5 animate-fadeIn">
      {/* Calendar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-white border border-outline-variant/20 p-4 rounded-2xl shadow-sm flex-shrink-0">
        {/* Month pagination */}
        <div className="flex items-center gap-3">
          <span className="text-md font-bold text-text-primary min-w-[120px]">
            {getMonthYearLabel(currentDate)}
          </span>
          <div className="flex items-center bg-surface-off-white p-0.5 rounded-lg border border-outline-variant/20">
            <button onClick={handlePrevDate} className="p-1 hover:bg-surface-white rounded-md transition-all text-text-secondary"><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
            <button onClick={handleTodayDate} className="px-2.5 py-1 hover:bg-surface-white rounded-md text-[10px] font-bold text-text-primary transition-all uppercase tracking-wide">Hoje</button>
            <button onClick={handleNextDate} className="p-1 hover:bg-surface-white rounded-md transition-all text-text-secondary"><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
          </div>
        </div>

        {/* View toggles & Filters */}
        <div className="flex items-center flex-wrap gap-4">
          <div className="flex bg-surface-off-white p-0.5 rounded-lg border border-outline-variant/20">
            <button onClick={() => setCalendarView('semanal')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${calendarView === 'semanal' ? 'bg-surface-white text-[#0071E3] shadow-xs' : 'text-text-secondary hover:text-text-primary'}`}>Semanal</button>
            <button onClick={() => setCalendarView('mensal')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${calendarView === 'mensal' ? 'bg-surface-white text-[#0071E3] shadow-xs' : 'text-text-secondary hover:text-text-primary'}`}>Mensal</button>
          </div>

          {/* Account Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-text-secondary shrink-0">Conta:</span>
            <CustomSelect
              options={[
                { value: 'all', label: 'Todas as Contas', icon: 'groups' },
                ...accounts.map(acc => ({
                  value: acc.username,
                  label: `@${acc.display_name || acc.username}`,
                  avatar: acc.avatar_url ? (acc.avatar_url.startsWith('http') ? acc.avatar_url : `${API}${acc.avatar_url}`) : null,
                  username: acc.username,
                }))
              ]}
              value={selectedFilterAccount}
              onChange={setSelectedFilterAccount}
              size="filter"
              align="left"
              className="min-w-[170px]"
            />
          </div>

          {/* Format Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-text-secondary shrink-0">Formato:</span>
            <CustomSelect
              options={[
                { value: 'all', label: 'Todos os Formatos', icon: 'auto_awesome_motion' },
                { value: 'reel', label: 'Reels', icon: 'movie' },
                { value: 'carousel', label: 'Feed', icon: 'photo_library' },
              ]}
              value={selectedFilterFormat}
              onChange={setSelectedFilterFormat}
              size="filter"
              align="left"
              className="min-w-[160px]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => pubState.setBulkModalOpen && pubState.setBulkModalOpen(true)}
              className="px-4 py-2 bg-[#0071E3] hover:bg-[#005cbb] text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
            <span className="material-symbols-outlined text-[16px]">rocket_launch</span> Agendamento em Massa
          </button>

          <button onClick={() => { setCreationWizardOpen(true); setWizardStep(1); }} className="px-4 py-2 bg-[#0071E3] hover:bg-[#005cbb] text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer">
            <span className="material-symbols-outlined text-[16px]">add</span> Novo Post
          </button>
        </div>
      </div>
    </div>

      {/* WEEKLY CALENDAR VIEW */ }
  {
    calendarView === 'semanal' && (
      <div className="bg-surface-white border border-outline-variant/20 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="grid grid-cols-7 border-b border-surface-container-high bg-surface-off-white text-center flex-shrink-0">
          {getDaysOfWeek(currentDate).map((day, idx) => {
            const dayName = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][day.getDay()];
            return (
              <div key={idx} className="py-3 border-r border-surface-container-high last:border-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">{dayName}</span>
                <span className={`text-xs font-bold mt-1 w-6 h-6 flex items-center justify-center rounded-full leading-none transition-all ${isToday(day) ? 'bg-[#0071E3] text-white shadow-sm' : 'text-text-primary'}`}>
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 flex-1 bg-white divide-x divide-surface-container-high min-h-0">
          {getDaysOfWeek(currentDate).map((day, idx) => {
            const dayPosts = getPostsForDay(day);
            return (
              <div key={idx} onClick={() => handleDayClick(day)} className="p-2 flex flex-col gap-2 cursor-pointer hover:bg-surface-off-white/40 transition-all group overflow-y-auto custom-scrollbar" title="Clique para agendar">
                {dayPosts.length > 0 ? dayPosts.map(post => <PostCard key={post.id} post={post} accounts={accounts} onDelete={handleDeleteSchedule} onRetry={handleRetrySchedule} />) : (
                  <div className="flex-1 flex items-center justify-center py-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-bold text-text-secondary bg-[#eeeef0] px-2 py-1 rounded-md flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">add</span> Agendar</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {scheduledPosts.length === 0 && (
          <div className="border-t border-surface-container-high py-4 flex flex-col items-center justify-center text-text-secondary gap-1 bg-surface-white flex-shrink-0">
            <span className="material-symbols-outlined text-[36px] opacity-35 text-[#0071E3]">calendar_today</span>
            <p className="text-xs font-bold">Nenhum post agendado para esta semana.</p>
            <button onClick={() => { setCreationWizardOpen(true); setWizardStep(1); }} className="text-[11px] font-bold text-[#0071E3] hover:underline mt-1">Agende seu primeiro post agora</button>
          </div>
        )}
      </div>
    )
  }

  {/* MONTHLY CALENDAR VIEW */ }
  {
    calendarView === 'mensal' && (
      <div className="bg-surface-white border border-outline-variant/20 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="grid grid-cols-7 border-b border-surface-container-high bg-surface-off-white text-center text-[10px] font-bold text-text-secondary uppercase py-2 flex-shrink-0">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((dayName, idx) => <div key={idx}>{dayName}</div>)}
        </div>
        <div
          className="grid grid-cols-7 flex-1 divide-x divide-y divide-surface-container-high bg-white border-l border-t border-surface-container-high min-h-0"
          style={{ gridTemplateRows: `repeat(${monthRowCount}, 1fr)` }}
        >
          {daysOfMonth.map((dayObj, idx) => {
            const dayPosts = getPostsForDay(dayObj.date);
            return (
              <div key={idx} onClick={() => handleDayClick(dayObj.date)} className={`p-1.5 flex flex-col gap-1 cursor-pointer transition-all hover:bg-surface-off-white/40 overflow-y-auto custom-scrollbar text-left relative group ${dayObj.isCurrentMonth ? 'text-text-primary' : 'bg-surface-off-white/20 text-text-secondary/50'}`}>
                <div className="flex justify-between items-center w-full flex-shrink-0">
                  <span className="text-[9px] font-bold">{dayObj.date.getDate() === 1 && !dayObj.isCurrentMonth ? `${dayObj.date.getDate()} de ${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][dayObj.date.getMonth()]}.` : dayObj.date.getDate() === 1 && dayObj.isCurrentMonth ? `1` : ''}</span>
                  <span className={`text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full ${isToday(dayObj.date) ? 'bg-[#0071E3] text-white shadow-xs' : dayObj.isCurrentMonth ? 'text-text-primary' : 'text-text-secondary/40'}`}>
                    {dayObj.date.getDate()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden max-h-[100px] flex-grow">
                  {dayPosts.slice(0, 2).map(post => <MonthlyPostPill key={post.id} post={post} accounts={accounts} onRetry={handleRetrySchedule} onDelete={handleDeleteSchedule} />)}
                  {dayPosts.length > 2 && <div className="text-[8px] font-bold text-[#0071E3] pl-1.5 leading-none mt-0.5">+{dayPosts.length - 2} mais</div>}
                </div>
                {dayPosts.length === 0 && (
                  <div className="flex-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-bold text-text-secondary bg-[#eeeef0] px-2 py-1 rounded-md flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">add</span> Agendar</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )
  }
    </div >
  );
}
