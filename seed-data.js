// Fictional demonstration only. No personal schedules or learning records.
(() => {
  const today=new Date(),week=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  week.setDate(week.getDate()-(week.getDay()+6)%7);
  const date=offset=>{const d=new Date(week);d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
  const event=(id,day,start,end,title,subject,extra={})=>({id:`demo-${id}`,seriesId:null,type:"study",date:date(day),start,end,title,subject,description:"虚构演示时间块，可编辑、移动或删除。",importance:"normal",completed:false,notes:"",...extra});
  window.SEED_EVENTS=[
    event(1,0,"09:00","10:00","示例课程·课堂时间","示例课程",{type:"class"}),
    event(2,0,"14:00","14:30","编程·基础练习","编程",{completed:true,notes:"演示记录：完成了一项虚构练习。"}),
    event(3,1,"10:00","11:00","阅读·第一部分","阅读"),
    event(4,2,"15:00","15:45","设计·小项目","设计"),
    event(5,3,"09:00","10:00","示例课程·课堂时间","示例课程",{type:"class"}),
    event(6,3,"14:00","14:30","编程·间隔复习","编程",{importance:"high"}),
    event(7,4,"16:00","16:15","阅读·回顾","阅读"),
    event(8,5,"10:00","11:00","设计·实践","设计"),
    event(9,1,"14:00","14:45","编程·待安排练习","编程",{backlog:true,backlogAt:1})
  ];
})();
