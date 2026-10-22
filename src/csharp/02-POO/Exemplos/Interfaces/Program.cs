// Interfaces: contrato + implementação concreta.

INotificador notificador = new NotificadorEmail();
notificador.Enviar("Bem-vindo ao roadmap!");

interface INotificador
{
    void Enviar(string mensagem);
}

class NotificadorEmail : INotificador
{
    public void Enviar(string mensagem)
    {
        Console.WriteLine($"[email] {mensagem}");
    }
}
